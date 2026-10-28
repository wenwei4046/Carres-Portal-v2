/** LOCAL TEST transport only. Real PostgreSQL functions/tables under the actual
 * authenticated role, inside ONE outer transaction. Never a Supabase fallback.
 * Its small PostgREST-shaped read adapter is NOT production PostgREST evidence. */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
const quote = (value: string) => "'" + value.replaceAll("'","''") + "'";
export class OwnedContextDatabase {
  private process: ChildProcessWithoutNullStreams;
  private queue: Promise<unknown> = Promise.resolve();
  private pending: { marker: string; out: string; err: string; resolve: (value: { out: string; err: string }) => void } | null = null;
  private serial = 0;
  private operations: Promise<unknown> = Promise.resolve();
  /** Scope THIS walk to newly-created TEST requests; do not edit/delete replay history. */
  requestIds: Set<string> | null = null;
  actor = { id: "fffffff1-0000-4000-8000-000000009698", role: "operation", email: "TEST-context-owner@carres.test" };
  constructor(url: string) {
    const parsed = new URL(url);
    if (!["127.0.0.1","localhost"].includes(parsed.hostname) || !parsed.pathname.startsWith("/carres_dryrun_")) throw new Error("Owned loopback TEST database required");
    this.process = spawn(process.env.CARRES_PSQL ?? "/opt/homebrew/opt/postgresql@17/bin/psql",[url,"-X","-Atq"],{stdio:"pipe"});
    this.process.stdout.on("data", data => {
      if (!this.pending) return; this.pending.out += String(data);
      if (this.pending.out.includes(this.pending.marker+"\n")) { const result = this.pending; this.pending = null; result.resolve({ out: result.out.slice(0,result.out.indexOf(result.marker)), err: result.err }); }
    });
    this.process.stderr.on("data", data => { if (this.pending) this.pending.err += String(data); });
  }
  execute(sql: string): Promise<{ out: string; err: string }> {
    const next = this.queue.then(() => new Promise<{ out: string; err: string }>(resolve => {
      const marker = `CODEX_LOCAL_END_${++this.serial}`;
      this.pending = { marker, out: "", err: "", resolve };
      this.process.stdin.write(sql+"\n\\echo "+marker+"\n");
    })); this.queue = next; return next;
  }
  async json(sql: string): Promise<any> {
    const result = await this.execute(sql);
    if (/ERROR:|FATAL:/.test(result.err)) throw new Error(result.err);
    return result.out.trim() ? JSON.parse(result.out.trim().split("\n").at(-1)!) : null;
  }
  async start(fixture: string) {
    const initialized = await this.execute("\\set VERBOSITY verbose\n\\set ON_ERROR_STOP off\n"+fixture.replace(/\\set ON_ERROR_STOP on/g,"\\set ON_ERROR_STOP off").replace(/rollback;\s*$/i,""));
    if (/ERROR:|FATAL:/.test(initialized.err)) throw new Error(initialized.err);
    await this.json("reset role; create or replace function public._purchasing_context_writer_admission() returns void language plpgsql set search_path=public,pg_temp as $owned_local$ begin return; end; $owned_local$; select 'true'::jsonb;");
  }
  async finish() { await this.operations; await this.queue; await this.execute("reset role; rollback;"); this.process.stdin.end(); }
  authenticated(sql: string, actor = { ...this.actor }): Promise<{ data: any; error: any }> {
    const next = this.operations.then(() => this.performAuthenticated(sql,actor));
    this.operations = next.catch(() => undefined); return next;
  }
  private async performAuthenticated(sql: string, actor: typeof this.actor): Promise<{ data: any; error: any }> {
    // Serialize claims + savepoint + function/read as a unit, including recovery.
    const result = await this.execute(`savepoint codex_request; set local role authenticated; select set_config('request.jwt.claims',${quote(JSON.stringify({sub:actor.id,role:"authenticated",app_metadata:{role:actor.role}}))},true); ${sql}`);
    if (/ERROR:|FATAL:/.test(result.err)) {
      await this.execute("rollback to savepoint codex_request; release savepoint codex_request;");
      const match = /ERROR:\s+([A-Z0-9]{5}):\s*([^\n]+)/.exec(result.err);
      return { data:null,error:{ code:match?.[1] ?? "TEST_SQL",message:match?.[2] ?? result.err,details:/DETAIL:\s*([^\n]+)/.exec(result.err)?.[1] ?? null } };
    }
    await this.execute("release savepoint codex_request;");
    const last = result.out.trim().split("\n").at(-1);
    return { data:last ? JSON.parse(last) : null,error:null };
  }
  client(identity = this.actor) {
    const db = this; const actor = { ...identity };
    return { rpc: async (name: string,args: Record<string,unknown> = {}) => {
      const meta = await db.json(`select coalesce(jsonb_agg(jsonb_build_object('names',p.proargnames,'types',(select jsonb_agg(format_type(t,null)) from unnest(p.proargtypes::oid[]) t),'set',p.proretset)),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=${quote(name)};`);
      const selected = meta.find((candidate: any) => Object.keys(args).every(key => candidate.names?.includes(key)));
      if (!selected) return { data:null,error:{code:"42883",message:`Missing owning function ${name}`} };
      const literal = (value: unknown,type: string): string => value == null ? `null::${type}` : type.endsWith("[]") && Array.isArray(value) ? `array[${value.map(item => quote(String(item))).join(",")}]::${type}` : `${quote(type === "jsonb" || type === "json" ? JSON.stringify(value) : String(value))}::${type}`;
      const actual = Object.entries(args).map(([key,value]) => `${key}=>${literal(value,selected.types[selected.names.indexOf(key)])}`).join(",");
      const result = await db.authenticated(`select jsonb_build_object('data',${selected.set ? `coalesce((select jsonb_agg(to_jsonb(t)) from public.${name}(${actual}) t),'[]')` : `to_jsonb(public.${name}(${actual}))`});`,actor);
      if(!result.error) result.data = result.data?.data ?? null;
      if(name === "purchasing_create_request_with_lines" && result.data?.id && db.requestIds) db.requestIds.add(result.data.id);
      return result;
    }, from: (table: string) => {
      if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error("Invalid TEST table identifier");
      let fields = "*"; let single = false; let count = false; let head = false;
      const filters: Array<(row:any)=>boolean> = []; const orders: Array<{ key:string; ascending:boolean }> = []; let begin = 0; let end = Infinity;
      const field = (row:any,key:string) => key.replaceAll("->>",".").replaceAll("->",".").split(".").reduce((value,part)=>value?.[part],row);
      const query: any = {
        select(value = "*",options: any = {}) { fields=value;count=options.count != null;head=options.head===true;return query; },
        eq(key:string,value:unknown) { filters.push(row=>field(row,key)===value);return query; },
        neq(key:string,value:unknown) { filters.push(row=>field(row,key)!==value);return query; },
        in(key:string,values:unknown[]) { filters.push(row=>values.includes(field(row,key)));return query; },
        is(key:string,value:unknown) { filters.push(row=>(field(row,key)??null)===value);return query; },
        not(key:string,op:string,value:unknown) { if(op!=="is") throw new Error(`Unsupported TEST not ${op}`);filters.push(row=>(field(row,key)??null)!==value);return query; },
        gt(key:string,value:any) { filters.push(row=>field(row,key)>value);return query; }, gte(key:string,value:any) { filters.push(row=>field(row,key)>=value);return query; },
        lt(key:string,value:any) { filters.push(row=>field(row,key)<value);return query; }, lte(key:string,value:any) { filters.push(row=>field(row,key)<=value);return query; },
        or(expression:string) {
          const matches=(row:any,term:string):boolean=> {
            if(term.startsWith("and(")&&term.endsWith(")")) return splitFields(term.slice(4,-1)).every(value=>matches(row,value));
            if(term.startsWith("or(")&&term.endsWith(")")) return splitFields(term.slice(3,-1)).some(value=>matches(row,value));
            const [key,op,...raw]=term.split("."); const value=raw.join(".").replace(/^"|"$/g,"");const actual=field(row,key);
            if(op==="is") return value==="null"?actual==null:String(actual)===value;
            if(op==="neq") return String(actual)!==value; if(op==="eq")return String(actual)===value;
            if(op==="lt")return actual<value;if(op==="gt")return actual>value;
            if(op==="in")return splitFields(value.replace(/^\(|\)$/g,"")).includes(String(actual));
            throw new Error(`Unsupported TEST or operator ${op}`);
          };
          filters.push(row=>splitFields(expression).some(term=>matches(row,term)));return query;
        },
        order(key:string,options:any={}) { orders.push({key,ascending:options.ascending!==false});return query; },
        limit(value:number) { end=value-1;return query; }, range(from:number,to:number) { begin=from;end=to;return query; },
        maybeSingle() { single=true;return query; }, single() { single=true;return query; },
        then(resolve:any,reject:any) { return (async()=> {
          const result = await db.authenticated(`select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.${table} t;`,actor); if(result.error) return result;
          let rows = result.data;
          if(table === "purchase_requests" && db.requestIds) rows = rows.filter((row:any)=>db.requestIds!.has(row.id));
          const relationCache = new Map<string,Promise<{ links:any[]; rows:any[] }>>();
          const names = splitFields(fields);
          // Expand only real FK relationships; unsupported/missing source fails.
          const projection = async(row:any,owner:string,list:string[]):Promise<any> => {
            const value:any = {};
            for(const item of list) {
              if(item==="*") { Object.assign(value,row);continue; }
              const nested=/^(?:(\w+):)?(\w+)(?:![\w]+)?\((.*)\)$/.exec(item);
              if(!nested) { const [alias,column]=item.includes(":")?item.split(":"):[item,item];if(!(column in row)) throw new Error(`Missing selected column ${owner}.${column}`);value[alias]=row[column];continue; }
              const [,alias,related,selection]=nested;
              const cacheKey=`${owner}/${related}`;
              let relation=relationCache.get(cacheKey);
              if(!relation) {
                relation=(async()=> {
                  const links=await db.json(`select coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'target',b.attname)),'[]') from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] join pg_attribute b on b.attrelid=c.confrelid and b.attnum=c.confkey[1] where c.contype='f' and c.conrelid=('public.'||${quote(owner)})::regclass and c.confrelid=('public.'||${quote(related)})::regclass;`);
                  if(links.length!==1) throw new Error(`Unsupported TEST FK ${owner}->${related}`);
                  const child=await db.authenticated(`select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.${related} t;`,actor);
                  if(child.error) throw new Error(child.error.message);return {links,rows:child.data};
                })();relationCache.set(cacheKey,relation);
              }
              const relationRows=await relation;
              const hit=relationRows.rows.find((candidate:any)=>candidate[relationRows.links[0].target]===row[relationRows.links[0].column]);
              value[alias??related]=hit ? await projection(hit,related,splitFields(selection)) : null;
            }return value;
          };
          // Filters here use base columns in this scoped Purchasing walk.
          rows=rows.filter((row:any)=>filters.every(filter=>filter(row)));
          for(const order of [...orders].reverse()) rows.sort((a:any,b:any)=>{const x=field(a,order.key),y=field(b,order.key);return x===y?0:(x==null?1:y==null?-1:x<y?-1:1)*(order.ascending?1:-1);});
          const total=rows.length;rows=rows.slice(begin,end===Infinity?undefined:end+1);
          rows=await Promise.all(rows.map((row:any)=>projection(row,table,names)));
          return { data:head?null:single?(rows[0]??null):rows,error:null,...(count?{count:total}:{}) };
        })().then(resolve,reject); },
      };return query;
    } };
  }
}
function splitFields(value:string):string[] {
  const fields:string[]=[];let start=0,depth=0;
  for(let index=0;index<value.length;index++) { if(value[index]==="(")depth++;if(value[index]===")")depth--;if(value[index]===","&&depth===0){fields.push(value.slice(start,index).trim());start=index+1;} }
  fields.push(value.slice(start).trim());return fields.filter(Boolean);
}
