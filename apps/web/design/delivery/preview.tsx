import './model';
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import OperationDelivery from '../../src/pages/operation/OperationDelivery';
import DeliveryOrdersRegister from '../../src/pages/operation/DeliveryOrdersRegister';
import DeliverySettings from '../../src/pages/operation/DeliverySettings';
import Panel from '../../src/components/kit/Panel';
import Button from '../../src/components/kit/Button';
import Input from '../../src/components/kit/Input';
import Select from '../../src/components/kit/Select';
import Checkbox from '../../src/components/kit/Checkbox';
import DatePicker from '../../src/components/kit/DatePicker';
import Modal from '../../src/components/kit/Modal';
import Textarea from '../../src/components/kit/Textarea';
import ModuleHeader from '../../src/pages/operation/components/ModuleHeader';
import { DELIVERY_REASONS } from '@carres/shared';
import { fmtDate } from '../../src/lib/fmt-date';
import { query, orders, docs, arrangements, unitCodes, day, attempts, sync } from './model';
import '../../src/index.css';
import './review.css';
// Review compositions only. No production route imports this entry.
const results = new Map<string, {
    result: string;
    date: string;
    time: string;
    receiver: string;
    source: string;
    reason: string;
    location: string;
    next: string;
    units: string[];
}>();
const evidence = new Map<string, {
    photo?: File;
    signed?: File;
    review?: string;
    reason?: string;
}>();
const histories = new Map<string, string[]>();
function Fact({ label, value }: {
    label: string;
    value: React.ReactNode;
}) { return <div className="grid gap-1 py-2 border-b border-kit-slate-5"><span className="text-label text-kit-slate-11">{label}</span><span className="text-body text-kit-slate-12 break-words">{value}</span></div>; }
function ReviewFrame() {
    const nav = useNavigate();
    const loc = useLocation();
    const [notes, setNotes] = useState(false);
    return <div className="flex h-screen flex-col bg-kit-canvas text-kit-slate-12">
 <aside aria-label="Design review" className="shrink-0 border-b border-kit-slate-6 bg-white p-3">
  <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-strong">Delivery · 工作预览 · 未完成审核</span><span className="text-meta text-kit-slate-11">全部为示例资料 · 保存只影响此预览 · 刷新恢复</span></div>
  <nav aria-label="Preview destinations" className="mt-2 flex flex-wrap gap-2">
   <Button variant="neutral" onClick={() => nav('/operation?tab=delivery&view=all')}>Monitor</Button>
   <Button variant="neutral" onClick={() => nav('/operation?tab=delivery&view=week&date=' + day)}>Delivery schedule</Button>
   <Button variant="neutral" onClick={() => nav('/operation/delivery-orders')}>Delivery Orders</Button>
   <Button variant="neutral" onClick={() => nav('/operation/settings/delivery/partners')}>Settings</Button>
   <Button variant="ghost" onClick={() => setNotes(!notes)}>审核说明</Button>
  </nav>
  {notes && <div className="mt-3 text-body text-kit-slate-11 grid gap-2"><p>请从 SO-9001 展开四个面板，试改物流，再回到日历；从 DO2609-9003 进入送货结果及证据。</p><p>列表／日历／安排表单沿用现有产品组件。DO 结果表单是待审核方案：实际日期、可选时间、该 DO 的固定货品、失败后续。示例不是上线证明。</p><p>此轮尚未呈现：多段运输、配置送货时段、完整 Settings 编辑及跨模块编辑。现有 Monitor 仍有旧文案（例如 Call customer）和尚未嵌入的 Sales Order 文档，这些是已发现待修正项。未展示的部分不算审核完成。</p></div>}
 </aside>
 <div className="min-h-0 flex-1 overflow-auto" key={loc.pathname.startsWith('/operation/delivery-orders/') ? loc.pathname : undefined}>
 <Routes key={loc.pathname + loc.search}>
  <Route path="/operation" element={<OperationDelivery />}/>
  <Route path="/operation/delivery-orders" element={<DeliveryOrdersRegister />}/>
  <Route path="/operation/delivery-orders/:doId" element={<DocumentPreview />}/>
  <Route path="/operation/settings/delivery/:section" element={<SettingsPreview />}/>
  <Route path="/operation/settings/delivery/partners/:partnerId/:partnerSection?" element={<SettingsPreview />}/>
  <Route path="*" element={<Panel title="Related records"><p className="text-body">这里连接其他模块。本次预览保留模块边界，不模拟其他模块的编辑。</p><Button variant="neutral" onClick={() => nav(-1)}>Back</Button></Panel>}/>
 </Routes></div><Toaster />
 </div>;
}
function SettingsPreview() { return <div className="h-full overflow-auto"><nav aria-label="Delivery settings" className="flex flex-wrap gap-3 border-b border-kit-slate-5 bg-white p-3">{[['partners', 'Logistics'], ['rules', 'Delivery Rules'], ['templates', 'Message Templates'], ['access', 'Access']].map(([s, l]) => <Link key={s} className="text-body text-kit-blue-11" to={'/operation/settings/delivery/' + s}>{l}</Link>)}</nav><p className="p-3 text-meta text-kit-slate-11">本页展示现有设置结构。配置时段及分配截止日期仍待设计；本预览不提交设置变更。</p><DeliverySettings /></div>; }
function DocumentPreview() {
    const { doId } = useParams();
    const nav = useNavigate();
    const d = docs.find(d => d.do_number === doId || d.id === doId) ?? docs[0];
    const o = d.orders;
    const a = arrangements.find(a => a.order_id === o.id)!;
    const [editing, setEditing] = useState(false);
    const [, redraw] = useState(0);
    const [fileView, setFileView] = useState<File | null>(null);
    const r = results.get(d.do_number);
    const proof = evidence.get(d.do_number) ?? {};
    const codes = d.scope.map(g => g.code);
    const record = (value: NonNullable<ReturnType<typeof results.get>>) => { results.set(d.do_number, value); attempts.push({ id: 'sample-result-' + d.id, do_number: d.do_number, leg: 0, result: value.result === 'Delivered' ? 'delivered' : value.result === 'Partially Delivered' ? 'partial' : 'failed', reason_key: DELIVERY_REASONS.find(r => r.label === value.reason)?.key ?? null, where_goods: value.location, recorded_at: new Date().toISOString(), actual_date: value.date }); sync(); histories.set(d.do_number, [`Delivery on ${fmtDate(value.date)} · ${value.result}`]); setEditing(false); redraw(v => v + 1); };
    const saveEvidence = async (kind: 'photo' | 'signed', file?: File) => { if (file) {
        let valid = false;
        try {
            const bitmap = await createImageBitmap(file);
            bitmap.close();
            valid = true;
        }
        catch { }
        setReadable(old => ({ ...old, [kind]: valid }));
        evidence.set(d.do_number, { ...proof, [kind]: file, review: undefined });
        redraw(v => v + 1);
    } };
    const [readable, setReadable] = useState<Record<string, boolean>>({});
    const [decision, setDecision] = useState('accept');
    const [reason, setReason] = useState('');
    return <div className="flex min-h-full flex-col"><ModuleHeader destinationHeader testId="preview-do-header" word={d.do_number} docTitle={d.do_number + ' · Design preview'}/>
 <div className="px-4 py-3 flex items-center justify-between gap-3"><Link to="/operation/delivery-orders" className="text-body text-kit-blue-11">← Delivery Orders</Link><span className="text-body">SO-{o.so} · {o.customer_name}</span></div>
 <div className="review-object grid gap-4 p-4">
 <div className="min-w-0 space-y-4 order-2 lg:order-1">
 <Panel title="Delivery Order"><div className="text-body grid gap-3"><p>{d.do_number} · SO-{o.so}</p><p className="text-meta text-kit-slate-11">设计检查：只展示本张 DO 已固定的两件货品。正式 PDF 仍沿用现有文件渲染器；这里不伪造签名或正式单据。</p><h3 className="text-strong">Goods on this trip</h3>{d.scope.map(g => <Fact key={g.code} label={g.code} value={g.label + ' · Qty ' + g.qty}/>)}</div></Panel>
 <Panel title="Delivery history" right={!r ? <Button onClick={() => setEditing(true)}>Record Delivery Result</Button> : undefined}>
 {r ? <div className="grid gap-2 text-body"><p className="text-strong">Delivery on {fmtDate(r.date)} · {r.result}</p>{r.time && <p>Time {r.time}</p>}<p>Goods: {r.location}</p><p>Information received from: {r.source}</p><p>{r.receiver && 'Received & signed by ' + r.receiver}</p>{r.reason && <p>{r.reason}</p>}{r.next && <p>{r.next}</p>}<p className="text-meta text-kit-slate-11">示例记录 · 实际日期不会被上传或审核时间覆盖</p></div> : <p className="text-body text-kit-slate-11">No delivery result yet.</p>}
 </Panel>
 <Panel title="Warehouse handover"><Fact label="Handed over" value={fmtDate('2026-09-29') + ' · 2 of 2 Units'}/><Fact label="Received by logistics" value="NETS · 2 of 2 Units"/><p className="mt-3 text-meta text-kit-slate-11">示例交接记录；送货结果不会代替仓库收货。</p></Panel>
 <Panel title="Evidence">{r?.result === 'Failed Delivery' ? <p className="text-body">失败送货的证据配置与审核流程仍待完善，不沿用成功送货的签收门槛。</p> : !r ? <p className="text-body text-kit-slate-11">No delivery result yet.</p> : <div className="grid gap-3">
 <p className="text-meta text-kit-slate-11">文件只在此浏览器预览，不会上传。此轮只验证可解码的图片；PDF／视频及失败证明策略仍未完成，不能按此预览批准。</p>
 {(['photo', 'signed'] as const).map(kind => <div key={kind} className="grid gap-2"><label className="text-body">{kind === 'photo' ? 'Upload delivery photo' : 'Upload signed DO'}<input className="block w-full text-body mt-1" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => saveEvidence(kind, e.target.files?.[0])}/></label>{proof[kind] && <Button variant="neutral" onClick={() => setFileView(proof[kind]!)}>{proof[kind]!.name}</Button>}</div>)}
 <h3 className="text-strong">Proof review</h3><p className="text-body">{proof.review ?? 'Not reviewed yet'}</p>
 <Select id="review-choice" label="Proof review" value={decision} onValueChange={setDecision} options={[{ value: 'accept', label: 'Accept proof' }, { value: 'more', label: 'Request more proof' }, { value: 'reject', label: 'Reject proof' }]}/>
 {decision !== 'accept' && <Textarea id="review-reason" label="Reason" value={reason} onChange={e => setReason(e.target.value)}/>}
 <Button disabled={decision === 'accept' ? (!proof.photo || !proof.signed || !readable.photo || !readable.signed) : !reason.trim()} onClick={() => { const word = decision === 'accept' ? 'Proof Accepted' : decision === 'more' ? 'More Proof Required' : 'Proof Rejected'; evidence.set(d.do_number, { ...proof, review: word, reason }); histories.set(d.do_number, [...(histories.get(d.do_number) ?? []), word]); redraw(v => v + 1); }}>Save review</Button>
 </div>}</Panel>
 <Panel title="Exceptions"><p className="text-body">{r && r.result !== 'Delivered' ? r.reason + ' · ' + r.next : 'No open problems'}</p></Panel>
 <Panel title="History"><div className="grid gap-3 text-body"><p>Created · {fmtDate(d.issued_at)}</p>{(histories.get(d.do_number) ?? []).map((s, i) => <p key={i}>{s}</p>)}</div></Panel>
 </div>
 <aside className="min-w-0 space-y-4 order-1 lg:order-2"><Panel title="Status"><Fact label="Delivery Status" value={r?.result ?? 'Out for delivery'}/><Fact label="Proof" value={proof.review ?? (r ? 'Upload delivery proof' : 'No delivery result yet.')}/></Panel><Panel title="Customer, Address & Access"><Fact label="Customer" value={o.customer_name}/><Fact label="Address" value={o.customer_address}/><Fact label="Building type" value="Landed"/></Panel><Panel title="Logistics Details"><Fact label="Logistics" value={a.partner_name ?? 'Logistics not assigned'}/><Fact label="Scheduled delivery" value={a.confirmed_date ? fmtDate(a.confirmed_date) : 'Not scheduled'}/><Fact label="Scheduled time" value={a.confirmed_time ?? 'Not recorded'}/><Fact label="Driver name" value={a.driver_name ?? 'Not recorded'}/><Fact label="Vehicle plate" value={a.vehicle ?? 'Not recorded'}/><Fact label="ETA" value={a.expected_arrival ?? 'Not recorded'}/></Panel><Panel title="Related records"><div className="flex flex-wrap gap-3 text-body"><Link to={'/operation?tab=delivery&view=all&expand=' + o.id + '%230'} className="text-kit-blue-11">Monitor</Link><Link to={'/operation/orders/' + o.id} className="text-kit-blue-11">SO-{o.so}</Link></div></Panel></aside>
 </div>
 {editing && <ResultForm doNumber={d.do_number} codes={codes} labels={d.scope.map(g => g.label)} onClose={() => setEditing(false)} onSave={record}/>}
 {fileView && <FileViewer file={fileView} onClose={() => setFileView(null)}/>}
 </div>;
}
function FileViewer({ file, onClose }: {
    file: File;
    onClose: () => void;
}) { const [url, setUrl] = useState(''); useEffect(() => { const u = URL.createObjectURL(file); setUrl(u); return () => URL.revokeObjectURL(u); }, [file]); return <Modal open onOpenChange={onClose} title={file.name} width="viewer">{file.type === 'application/pdf' ? <iframe title={file.name} src={url} className="w-full h-screen"/> : <img src={url} alt={file.name} className="w-full object-contain"/>}</Modal>; }
function ResultForm({ doNumber, codes, labels, onClose, onSave }: {
    doNumber: string;
    codes: string[];
    labels: string[];
    onClose: () => void;
    onSave: (r: any) => void;
}) {
    const [result, setResult] = useState('Delivered');
    const [date, setDate] = useState<string | null>(null);
    const [time, setTime] = useState('');
    const [receiver, setReceiver] = useState('');
    const [picked, setPicked] = useState<string[]>([]);
    const [reason, setReason] = useState('');
    const [where, setWhere] = useState('');
    const [next, setNext] = useState('');
    const [source, setSource] = useState('');
    const units = result === 'Delivered' ? codes : result === 'Failed Delivery' ? [] : picked;
    const incomplete = result !== 'Delivered';
    const valid = !!date && date <= day && !!source.trim() && (result === 'Failed Delivery' || !!receiver.trim()) && (result !== 'Partially Delivered' || (picked.length > 0 && picked.length < codes.length)) && (!incomplete || (reason && where && next));
    return <Modal open onOpenChange={onClose} title="Record Delivery Result" width="wide" footer={<><Button variant="neutral" onClick={onClose}>Cancel</Button><Button disabled={!valid} onClick={() => onSave({ result, date, time, receiver, source, reason, location: incomplete ? where : 'With Customer', next, units })}>Record Delivery Result</Button></>}>
 <div className="grid gap-4"><p className="text-body">{doNumber}</p><p className="text-meta text-kit-slate-11">待审核方案：日期是实际发生日期；时间不知道就留空。日期不从排程或上传时间代填。</p>
 <Select id="delivery-result" label="Delivery Result" value={result} onValueChange={setResult} options={['Delivered', 'Partially Delivered', 'Failed Delivery'].map(v => ({ value: v, label: v }))}/>
 <div className="grid gap-3 sm:grid-cols-2"><DatePicker id="actual-date" label="Date" required value={date} onChange={setDate}/><Input id="actual-time" type="time" label="Time (optional)" value={time} onChange={e => setTime(e.target.value)}/></div>
 <Input id="reported-by" label="Information received from" required value={source} onChange={e => setSource(e.target.value)}/>
 {result !== 'Failed Delivery' && <Input id="receiver" label="Received & signed by" required value={receiver} onChange={e => setReceiver(e.target.value)}/>}
 <Panel title="Goods on this trip"><div className="grid gap-3">{codes.map((c, i) => result === 'Partially Delivered' ? <Checkbox key={c} id={c} label={c + ' · ' + labels[i]} checked={picked.includes(c)} onCheckedChange={checked => setPicked(old => checked ? [...old, c] : old.filter(x => x !== c))}/> : <p key={c} className="text-body">{c} · {labels[i]} · {result}</p>)}</div></Panel>
 {result === 'Partially Delivered' && <p className="text-body">{picked.length} of {codes.length} · Delivered</p>}
 {incomplete && <><Select id="failure-reason" label="Reason" value={reason} onValueChange={setReason} options={DELIVERY_REASONS.map(r => ({ value: r.label, label: r.label }))}/><Select id="goods-location" label="Goods" value={where} onValueChange={setWhere} options={['Still with Logistics', 'Returned to Warehouse', 'With Customer'].map(v => ({ value: v, label: v }))}/><Select id="next-action" label="Next action" value={next} onValueChange={setNext} options={['Arrange a new delivery date', 'Return to Warehouse for checking'].map(v => ({ value: v, label: v }))}/><p className="text-meta text-kit-slate-11">示例只处理同一去向的剩余货品。不同去向的分组处理仍待补齐，不视为已审核。</p></>}
 </div></Modal>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={query}><MemoryRouter initialEntries={['/operation?tab=delivery&view=all']}><ReviewFrame /></MemoryRouter></QueryClientProvider>);
