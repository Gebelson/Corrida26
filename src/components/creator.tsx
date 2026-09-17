"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Crown,
  Gem,
  Gift,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Medal,
  MousePointerClick,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import { useRace } from "./race-provider";
import {
  money,
  type CreatorLevel,
  type CreatorProgramSettings,
  type CreatorSummary,
} from "@/lib/types";
import "./creator.css";

type Row = Record<string, string | number | boolean | null>;
interface DashboardData { summary: CreatorSummary; levels: CreatorLevel[]; program?: CreatorProgramSettings; commissions: Row[]; referrals: Row[]; ledger: Row[]; withdrawals: Row[]; notifications: Row[]; challenges: Row[] }
const date = (value: unknown) => new Date(String(value)).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const cash = (cents: unknown) => money(Number(cents || 0) / 100);
const statusName: Record<string, string> = { pending: "Pendente", available: "Disponível", blocked: "Bloqueada", cancelled: "Cancelada", reversed: "Estornada", paid: "Paga", processing: "Processando", failed: "Falhou" };
const defaultProgram: CreatorProgramSettings = {
  enabled: true,
  attributionDays: 30,
  commissionDays: 30,
  holdDays: 14,
  minWithdrawal: 50,
  customerBonusPercent: 10,
  customerBonusMax: 20,
  withdrawalsEnabled: true,
  leaderboardEnabled: false,
};

export function CreatorDashboardPage() {
  const { user, api, openLogin } = useRace();
  const [data, setData] = useState<DashboardData | null>(null), [error, setError] = useState(""), [copied, setCopied] = useState(false), [tab, setTab] = useState("overview"), [withdraw, setWithdraw] = useState(false);
  const load = useCallback(async () => { try { setData(await api<DashboardData>("/api/creator")); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar."); } }, [api]);
  useEffect(() => { if (user && !user.anonymous) void load(); }, [user, load]);
  if (!user || user.anonymous) return <main className="creator-shell creator-gate"><LockKeyhole/><span className="eyebrow">PROGRAMA DE CRIADORES</span><h1>TRANSFORME A CORRIDA EM RESULTADO.</h1><p>Entre para criar seu link, acompanhar indicações e receber comissões diretas.</p><button className="button button-primary" onClick={openLogin}>Entrar para começar <ArrowRight size={17}/></button></main>;
  if (error) return <main className="creator-shell creator-gate"><ShieldCheck/><h1>PAINEL INDISPONÍVEL.</h1><p>{error}</p><button className="button" onClick={() => void load()}>Tentar novamente</button></main>;
  if (!data) return <main className="creator-shell creator-gate"><LoaderCircle className="spin"/><p>Preparando seu painel…</p></main>;
  const s = data.summary;
  const program = data.program || defaultProgram;
  const tabs = [["overview","Visão geral"],["referrals","Indicados"],["commissions","Comissões"],["wallet","Carteira"],["missions","Missões"],["guide","Como funciona"]];
  return <main className="creator-shell">
    <section className="creator-hero"><div><span className="eyebrow">CENTRAL DO CRIADOR</span><h1>SEU LINK. SUA TORCIDA.<br/><em>SUA COMISSÃO.</em></h1><p>Comissão direta sobre participações elegíveis dos seus indicados durante {program.commissionDays} dias.</p></div><div className="level-card" style={{"--level":s.level.color} as React.CSSProperties}><span>NÍVEL ATUAL</span><LevelBadge level={s.level} current prominent/><b>{s.level.commissionPercent}%</b><small>de comissão por pagamento válido</small></div></section>
    <section className="referral-box"><div><Link2/><span>SEU LINK EXCLUSIVO</span><strong>{s.referralUrl}</strong></div><button onClick={async()=>{await navigator.clipboard.writeText(s.referralUrl);setCopied(true);setTimeout(()=>setCopied(false),1800)}}>{copied?<Check/>:<Copy/>}{copied?"Copiado":"Copiar link"}</button><a href={`https://wa.me/?text=${encodeURIComponent(`Entre na CORRIDA 26 pelo meu link: ${s.referralUrl}`)}`} target="_blank" rel="noopener noreferrer">Compartilhar</a></section>
    <nav className="creator-tabs">{tabs.map(([id,label])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {tab==="overview" && <><section className="creator-metrics"><Metric icon={<WalletCards/>} label="Saldo disponível" value={money(s.balances.available)} accent/><Metric icon={<Sparkles/>} label="Comissão pendente" value={money(s.balances.pending)}/><Metric icon={<MousePointerClick/>} label="Cliques" value={String(s.clicks)}/><Metric icon={<UserPlus/>} label="Compradores" value={String(s.buyers)}/><Metric icon={<Users/>} label="Conversão" value={`${s.conversionRate.toFixed(1)}%`}/><Metric icon={<Trophy/>} label="Receita indicada" value={money(s.totalRevenue)}/></section><section className="creator-grid"><article className="creator-panel"><h2>PROGRESSO DO MÊS</h2><div className="progress-head"><strong>{money(s.monthlyRevenue)}</strong><span>{s.nextLevel?`Meta ${money(s.nextLevel.minMonthlyRevenue)} · ${s.nextLevel.name}`:"Nível máximo"}</span></div><div className="creator-progress"><i style={{width:`${s.progressPercent}%`,background:s.level.color}}/></div><div className="level-line">{data.levels.map(l=><LevelBadge key={l.id} level={l} current={l.id===s.level.id} compact/>)}</div></article><article className="creator-panel"><h2>ÚLTIMAS ATUALIZAÇÕES</h2>{data.notifications.slice(0,4).map(n=><div className="notice-row" key={String(n.id)}><span/><div><b>{n.title}</b><small>{n.message}</small></div></div>)}{!data.notifications.length&&<p className="empty-copy">Suas comissões e conquistas aparecerão aqui.</p>}</article></section></>}
    {tab==="guide" && <CreatorGuide levels={data.levels} currentLevel={s.level} program={program}/>}
    {tab==="referrals" && <DataPanel title="PESSOAS INDICADAS" headers={["Nome","Cadastro","Compras","Receita"]}>{data.referrals.map(r=><tr key={String(r.id)}><td>{r.name}</td><td>{date(r.attributed_at)}</td><td>{r.purchases}</td><td>{cash(r.revenue_cents)}</td></tr>)}</DataPanel>}
    {tab==="commissions" && <DataPanel title="COMISSÕES" headers={["Cliente","Valor elegível","Comissão","Status","Liberação"]}>{data.commissions.map(r=><tr key={String(r.id)}><td>{r.customer_name}</td><td>{cash(r.eligible_amount_cents)}</td><td>{cash(r.amount_cents)}</td><td><span className={`status-pill ${r.status}`}>{statusName[String(r.status)]||r.status}</span></td><td>{date(r.available_at)}</td></tr>)}</DataPanel>}
    {tab==="wallet" && <><section className="wallet-balance"><div><span>DISPONÍVEL PARA SAQUE</span><strong>{money(s.balances.available)}</strong><small>Pendente: {money(s.balances.pending)} · Em processamento: {money(s.balances.withdrawalPending)}</small></div><button className="button button-primary" disabled={s.balances.available<50||s.withdrawalsSuspended} onClick={()=>setWithdraw(true)}>Solicitar saque</button></section><DataPanel title="EXTRATO IMUTÁVEL" headers={["Data","Descrição","Conta","Valor"]}>{data.ledger.map(r=><tr key={String(r.id)}><td>{date(r.created_at)}</td><td>{r.description}</td><td>{String(r.account).replace("_"," ")}</td><td className={Number(r.amount_cents)>=0?"positive":"negative"}>{Number(r.amount_cents)>=0?"+":""}{cash(r.amount_cents)}</td></tr>)}</DataPanel></>}
    {tab==="missions" && <section className="creator-grid">{data.challenges.map(c=><article className="creator-panel mission" key={String(c.id)}><Medal/><h2>{c.title}</h2><p>{c.description}</p><div className="creator-progress"><i style={{width:`${Math.min(100,Number(c.progress||0)/Number(c.target)*100)}%`}}/></div><small>{c.progress||0} de {c.target} · prêmio {cash(c.reward_cents)}</small></article>)}{!data.challenges.length&&<article className="creator-panel"><h2>NOVAS MISSÕES EM BREVE</h2><p className="empty-copy">As metas são bônus opcionais e não alteram sua comissão direta.</p></article>}</section>}
    <section className="creator-disclosure"><ShieldCheck/><p><b>Programa de indicação direta.</b> Uma única camada de comissão. Não há comissão por indicar outros criadores, promessa de renda ou ganho garantido. Compras estornadas revertem a comissão correspondente.</p></section>
    {withdraw&&<WithdrawalModal summary={s} api={api} onClose={()=>setWithdraw(false)} onDone={async()=>{setWithdraw(false);await load()}}/>}
  </main>;
}

const levelIcons = {
  beginner: Rocket,
  creator: Sparkles,
  pro: Gem,
  elite: Crown,
} as const;

function LevelBadge({
  level,
  current = false,
  compact = false,
  prominent = false,
}: {
  level: CreatorLevel;
  current?: boolean;
  compact?: boolean;
  prominent?: boolean;
}) {
  const Icon = levelIcons[level.id as keyof typeof levelIcons] || Medal;
  return (
    <span
      className={`creator-level-badge ${current ? "current" : ""} ${compact ? "compact" : ""} ${prominent ? "prominent" : ""}`}
      style={{ "--level": level.color } as React.CSSProperties}
      title={`Nível ${level.name}: ${level.commissionPercent}% de comissão`}
    >
      <i>
        <Icon />
      </i>
      <span>
        <small>{current ? "SEU NÍVEL" : "NÍVEL"}</small>
        <strong>{level.name}</strong>
      </span>
      <b>{level.commissionPercent}%</b>
    </span>
  );
}

function levelRange(level: CreatorLevel) {
  if (level.maxMonthlyRevenue === null)
    return `A partir de ${money(level.minMonthlyRevenue)} no mês`;
  if (level.minMonthlyRevenue === 0)
    return `Até ${money(level.maxMonthlyRevenue)} no mês`;
  return `${money(level.minMonthlyRevenue)} a ${money(level.maxMonthlyRevenue)} no mês`;
}

function CreatorGuide({
  levels,
  currentLevel,
  program,
}: {
  levels: CreatorLevel[];
  currentLevel: CreatorLevel;
  program: CreatorProgramSettings;
}) {
  const exampleAmount = 100;
  const exampleCommission =
    (exampleAmount * currentLevel.commissionPercent) / 100;
  const steps = [
    {
      icon: Link2,
      title: "Compartilhe seu link",
      copy: `O clique fica válido por ${program.attributionDays} dias para a pessoa criar a conta.`,
    },
    {
      icon: UserPlus,
      title: "A indicação é vinculada",
      copy: `Depois do cadastro, as participações elegíveis ficam ligadas a você por ${program.commissionDays} dias.`,
    },
    {
      icon: BadgeCheck,
      title: "O pagamento é confirmado",
      copy: "A comissão nasce somente após a confirmação segura do pagamento pelo backend.",
    },
    {
      icon: CircleDollarSign,
      title: "Você recebe a comissão",
      copy: `O valor fica pendente por ${program.holdDays} dias e depois passa para o saldo disponível.`,
    },
  ];
  return (
    <section className="creator-guide">
      <header className="guide-heading">
        <div>
          <span className="eyebrow">GANHO POR INDICAÇÃO</span>
          <h2>DO SEU LINK ATÉ O PIX.</h2>
          <p>
            Você recebe uma porcentagem das participações elegíveis e
            confirmadas feitas diretamente pelas pessoas que entraram pelo seu
            link.
          </p>
        </div>
        <LevelBadge level={currentLevel} current prominent />
      </header>

      <div className="earning-flow" aria-label="Etapas do ganho por indicação">
        {steps.map(({ icon: Icon, title, copy }, index) => (
          <div className="flow-item" key={title}>
            <article>
              <span className="flow-number">0{index + 1}</span>
              <i><Icon /></i>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
            {index < steps.length - 1 && <ChevronRight aria-hidden="true" />}
          </div>
        ))}
      </div>

      <article className="earning-example">
        <div className="example-figure" aria-hidden="true">
          <span><Users /></span>
          <i><ArrowRight /></i>
          <span><BadgeCheck /></span>
          <i><ArrowRight /></i>
          <span className="example-coin"><CircleDollarSign /></span>
        </div>
        <div className="example-copy">
          <span>EXEMPLO NO SEU NÍVEL</span>
          <h3>UMA PARTICIPAÇÃO DE {money(exampleAmount)}</h3>
          <p>
            Com o badge <b>{currentLevel.name}</b>, sua taxa atual é de{" "}
            <strong>{currentLevel.commissionPercent}%</strong>.
          </p>
        </div>
        <div className="example-equation">
          <span>{money(exampleAmount)}</span>
          <i>× {currentLevel.commissionPercent}%</i>
          <b>= {money(exampleCommission)}</b>
          <small>de comissão direta</small>
        </div>
      </article>

      <div className="guide-section-title">
        <div>
          <span className="eyebrow">BADGES E TAXAS</span>
          <h2>QUANTO MAIS SUA COMUNIDADE MOVIMENTA, MAIOR SUA TAXA.</h2>
        </div>
        <p>O nível considera a receita indicada confirmada no mês atual.</p>
      </div>
      <div className="level-badges-grid">
        {levels.map((level) => (
          <article
            key={level.id}
            className={level.id === currentLevel.id ? "active" : ""}
            style={{ "--level": level.color } as React.CSSProperties}
          >
            <LevelBadge
              level={level}
              current={level.id === currentLevel.id}
            />
            <p>{levelRange(level)}</p>
            <div>
              <span>COMISSÃO</span>
              <strong>{level.commissionPercent}%</strong>
            </div>
          </article>
        ))}
      </div>

      <div className="guide-rules">
        <article><Clock3/><div><b>{program.commissionDays} dias</b><span>de vínculo após o cadastro</span></div></article>
        <article><ShieldCheck/><div><b>{program.holdDays} dias</b><span>até a comissão ficar disponível</span></div></article>
        <article><WalletCards/><div><b>{money(program.minWithdrawal)}</b><span>valor mínimo para solicitar Pix</span></div></article>
        {program.customerBonusPercent > 0 && <article><Gift/><div><b>{program.customerBonusPercent}% de bônus</b><span>para o indicado na primeira participação, até {money(program.customerBonusMax)}</span></div></article>}
      </div>
      <p className="guide-note">
        <ShieldCheck /> Compras canceladas, estornadas ou consideradas inválidas
        não geram comissão. O programa tem somente uma camada: você ganha pelas
        suas indicações diretas.
      </p>
    </section>
  );
}

function Metric({icon,label,value,accent=false}:{icon:React.ReactNode;label:string;value:string;accent?:boolean}) { return <article className={`metric-card ${accent?"accent":""}`}><span>{icon}{label}</span><strong>{value}</strong></article> }
function DataPanel({title,headers,children}:{title:string;headers:string[];children:React.ReactNode}) { return <section className="creator-panel data-panel"><h2>{title}</h2><div className="table-scroll"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div></section> }
function WithdrawalModal({summary,api,onClose,onDone}:{summary:CreatorSummary;api:<T>(u:string,o?:RequestInit)=>Promise<T>;onClose:()=>void;onDone:()=>void}) {
  const [amount,setAmount]=useState(Math.floor(summary.balances.available).toString()),[pixKey,setPixKey]=useState(""),[type,setType]=useState("cpf"),[tax,setTax]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");try{await api("/api/creator/withdrawals",{method:"POST",body:JSON.stringify({amount:Number(amount),pixKeyType:type,pixKey,taxNumber:tax.replace(/\D/g,""),idempotencyKey:crypto.randomUUID()})});await onDone()}catch(err){setError(err instanceof Error?err.message:"Falha ao solicitar saque.")}finally{setBusy(false)}}
  return <div className="creator-modal-backdrop" onMouseDown={onClose}><form className="creator-modal" onSubmit={submit} onMouseDown={e=>e.stopPropagation()}><button type="button" className="modal-x" onClick={onClose}>×</button><span className="eyebrow">SAQUE PIX</span><h2>RETIRAR SALDO</h2><p>Valor mínimo de R$ 50. A solicitação fica registrada e pode passar por revisão antifraude.</p><label>Valor em reais<input type="number" min="50" max={Math.floor(summary.balances.available)} value={amount} onChange={e=>setAmount(e.target.value)} required/></label><label>Tipo da chave<select value={type} onChange={e=>setType(e.target.value)}><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="random">Aleatória</option></select></label><label>Chave Pix<input value={pixKey} onChange={e=>setPixKey(e.target.value)} required/></label><label>CPF/CNPJ do titular<input inputMode="numeric" value={tax} onChange={e=>setTax(e.target.value)} required/></label>{summary.kycStatus!=="approved"&&<p className="form-error">Sua identidade precisa ser aprovada pelo administrador antes do saque.</p>}{error&&<p className="form-error">{error}</p>}<button className="button button-primary wide" disabled={busy||summary.kycStatus!=="approved"}>{busy?<LoaderCircle className="spin"/>:null} Confirmar solicitação</button></form></div>
}
