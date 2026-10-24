import {it,expect} from 'vitest';
import {QueryClient} from '@tanstack/react-query';
import {invalidateReceivingReads} from './receiving-reads';
it('invalidates both separate Tasks and Workspace facts after a corrected receipt saves',async()=>{
 const client=new QueryClient(); const tasks=['operation','legacy-tasks'];const work=['operation','work','team'];const unrelated=['settings'];
 for(const key of [tasks,work,unrelated])client.setQueryData(key,{original:true});
 await invalidateReceivingReads(client);
 expect(client.getQueryState(tasks)?.isInvalidated).toBe(true);expect(client.getQueryState(work)?.isInvalidated).toBe(true);
 expect(client.getQueryData(tasks)).toEqual({original:true});expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
});
