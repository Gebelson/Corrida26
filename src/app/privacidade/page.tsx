import Link from "next/link";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { SecondaryHeading } from "@/components/secondary";

export const metadata = {
  title: "Privacidade",
  description: "Política de privacidade da plataforma CORRIDA 26.",
};

export default function PrivacyPage() {
  return (
    <main className="sec-page sec-rules">
      <SecondaryHeading
        eyebrow="PRIVACIDADE E SEGURANÇA"
        title="SEUS DADOS, COM TRANSPARÊNCIA."
        description="Como a CORRIDA 26 trata as informações necessárias para operar o jogo."
      />
      <section className="sec-panel sec-rules-intro">
        <ShieldCheck size={34} />
        <div>
          <h2>COLETAMOS APENAS O NECESSÁRIO.</h2>
          <p>
            A plataforma pode tratar identificação da conta, dados de contato,
            registros de participação, informações técnicas de segurança e o
            status das transações. Dados de pagamento são processados pelo
            provedor integrado e não são usados para criar perfis políticos.
          </p>
        </div>
      </section>
      <div className="sec-rule-grid">
        <section className="sec-panel sec-rule">
          <span>01</span><h2>Finalidades</h2>
          <p>Autenticar usuários, registrar movimentações, evitar fraude, manter o placar, prestar suporte e cumprir obrigações legais.</p>
        </section>
        <section className="sec-panel sec-rule">
          <span>02</span><h2>Compartilhamento</h2>
          <p>Dados são compartilhados somente com serviços necessários à operação, como hospedagem, autenticação, banco de dados e pagamentos.</p>
        </section>
        <section className="sec-panel sec-rule">
          <span>03</span><h2>Retenção e segurança</h2>
          <p>Registros são mantidos pelo período necessário à operação, auditoria e defesa de direitos. Aplicamos controles de acesso, criptografia e registros imutáveis.</p>
        </section>
        <section className="sec-panel sec-rule">
          <span>04</span><h2>Seus direitos</h2>
          <p>Você pode solicitar acesso, correção ou esclarecimentos pelo e-mail corrida26.contato@gmail.com, observadas as retenções exigidas por lei e pela prevenção a fraudes.</p>
        </section>
      </div>
      <section className="sec-panel sec-rule-details">
        <div><LockKeyhole size={23}/><h2>Login social</h2><p>Ao entrar com Google, recebemos os dados básicos autorizados por você, como nome, e-mail e identificador da conta. Não recebemos sua senha do Google.</p></div>
        <div><ShieldCheck size={23}/><h2>Paródia sem perfil político</h2><p>As interações medem somente atividade interna da plataforma e não são usadas como pesquisa, intenção de voto ou classificação política.</p></div>
      </section>
      <p className="sec-footnote">Última atualização: 16 de setembro de 2026.</p>
      <Link href="/" className="sec-button sec-button-primary">Voltar para a corrida <ArrowRight size={18}/></Link>
    </main>
  );
}
