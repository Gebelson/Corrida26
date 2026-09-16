import Link from "next/link";
import { ArrowRight, FileCheck2, ShieldCheck } from "lucide-react";
import { SecondaryHeading } from "@/components/secondary";

export const metadata = {
  title: "Termos de uso",
  description: "Termos de uso da plataforma CORRIDA 26.",
};

export default function TermsPage() {
  return (
    <main className="sec-page sec-rules">
      <SecondaryHeading
        eyebrow="TERMOS DE USO"
        title="UMA CORRIDA COM REGRAS CLARAS."
        description="Condições para utilizar a CORRIDA 26 e participar do placar simbólico."
      />
      <section className="sec-panel sec-rules-intro">
        <FileCheck2 size={34}/>
        <div><h2>ENTRETENIMENTO E PONTOS INTERNOS.</h2><p>Ao usar a plataforma, você reconhece que a CORRIDA 26 é uma paródia de entretenimento. O placar não representa eleição, voto, pesquisa, intenção de voto, doação, campanha ou previsão eleitoral.</p></div>
      </section>
      <div className="sec-rule-grid">
        <section className="sec-panel sec-rule"><span>01</span><h2>Participação</h2><p>Você escolhe uma ação e um valor. A movimentação só produz pontos após a confirmação válida pelo backend e pelo provedor de pagamento.</p></section>
        <section className="sec-panel sec-rule"><span>02</span><h2>Conduta</h2><p>É proibido explorar falhas, automatizar abusos, manipular APIs, reproduzir webhooks, fraudar pagamentos ou usar a plataforma para assédio e atividades ilegais.</p></section>
        <section className="sec-panel sec-rule"><span>03</span><h2>Correções</h2><p>Transações inválidas, duplicadas, contestadas ou fraudulentas podem ser canceladas ou estornadas. Toda correção administrativa gera registro de auditoria.</p></section>
        <section className="sec-panel sec-rule"><span>04</span><h2>Disponibilidade</h2><p>Podemos realizar manutenção, atualizar regras e suspender recursos para proteger a segurança e a integridade da plataforma.</p></section>
      </div>
      <section className="sec-panel sec-rule-details">
        <div><ShieldCheck size={23}/><h2>Contas e segurança</h2><p>Você é responsável por proteger o acesso à sua conta. Podemos limitar ou suspender contas associadas a fraude, abuso ou risco à plataforma.</p></div>
        <div><FileCheck2 size={23}/><h2>Contato</h2><p>Dúvidas sobre estes termos podem ser enviadas para corrida26.contato@gmail.com.</p></div>
      </section>
      <p className="sec-footnote">Última atualização: 16 de setembro de 2026.</p>
      <Link href="/" className="sec-button sec-button-primary">Voltar para a corrida <ArrowRight size={18}/></Link>
    </main>
  );
}
