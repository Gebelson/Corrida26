# Laboratório Pix

Rota isolada: **/laboratorio-pix**. Não cria cobrança, não altera o checkout e não envia a imagem ao servidor.

## Pipeline

1. Upload local de PNG, JPEG ou WebP, limitado a 15 MB.
2. BarcodeDetector tenta detectar o formato qr_code.
3. jsQR processa os pixels localmente como fallback.
4. O conteúdo só é marcado como Pix após validar TLV, GUI BR.GOV.BCB.PIX, moeda 986, país BR e CRC16.
5. O laboratório oferece três testes independentes: copiar, ACTION_SEND/Web Share e ACTION_VIEW/custom scheme.

Para o checkout real da DePix, deve-se usar diretamente o payload Pix retornado pela API. Ler a imagem do QR seria processamento desnecessário e uma URL remota ainda pode bloquear canvas por CORS.

## A, B, C e D

- **A — Decodificar sem câmera:** possível em Chrome Android, PWA Android e Safari iPhone; jsQR cobre a ausência de BarcodeDetector.
- **B — Sistema operacional reconhecer o resultado como Pix:** não há API Web. O classificador usado por Câmera, Google Lens ou Visual Look Up não é exposto a sites ou PWAs.
- **C — Abrir um banco:** parcialmente possível se o app registrar exatamente um URI scheme, App Link, Universal Link ou intent-filter. Não existe handler Pix universal publicado.
- **D — Entregar o Pix preenchido:** exige contrato/deep link oficial do banco ou iniciação de pagamento/Open Finance. Um payload EMV correto não obriga um app a aceitá-lo.

## Experimento ACTION_VIEW

No Android, o botão monta um intent com scheme pix e action android.intent.action.VIEW. No iOS, tenta pix://pay com o payload na query.

Esses endereços são deliberadamente experimentais. pix:// não é um padrão do Banco Central, Android ou Apple. A tentativa só funciona se algum app instalado tiver registrado esse scheme e souber interpretar o parâmetro payload.

O código é copiado sincronamente dentro do clique, antes da navegação. visibilitychange registra se a página perdeu visibilidade; isso é apenas indício de que um handler ou app foi aberto. Não comprova que era um banco, que o payload foi importado ou que houve pagamento. Se a página continuar visível por 1,8 segundo, o laboratório relata ausência de handler e mantém o Pix copiado.

## ACTION_SEND

O botão Compartilhar usa Web Share com texto. No Android isso corresponde ao compartilhamento genérico; no iOS abre a Share Sheet. Um banco só aparece se declarar que recebe esse tipo de conteúdo. ACTION_SEND não fornece a semântica privada usada pela câmera para classificar um QR como Pix.

## Matriz esperada

| Ambiente | Leitura | ACTION_VIEW experimental | ACTION_SEND |
|---|---|---|---|
| Chrome Android | BarcodeDetector ou jsQR | Só com handler pix instalado | Web Share disponível |
| PWA Android | BarcodeDetector ou jsQR | Mesma limitação do Chrome | Web Share disponível |
| Safari iPhone | jsQR | Só com custom scheme pix instalado | Share Sheet disponível |

Instalar como PWA não concede acesso aos intents privados do scanner ou dos bancos.

## Teste manual

1. Abra /laboratorio-pix em HTTPS.
2. Envie uma screenshot nítida com um QR Pix completo.
3. Confirme recebedor, valor, TXID e CRC16.
4. Teste Pagar este Pix (ACTION_VIEW) e registre se o navegador perdeu visibilidade.
5. Volte à página e verifique se o banco recebeu e preencheu o Pix; o site não pode concluir isso sozinho.
6. Teste Compartilhar (ACTION_SEND) separadamente.
7. Repita em Chrome Android, PWA instalada e Safari iPhone.

Nenhum desses testes confirma pagamentos automaticamente; o usuário sempre deve revisar e confirmar no banco.

## Referências

- [Barcode Detection API](https://wicg.github.io/shape-detection-api/#barcode-detection-api)
- [jsQR](https://github.com/cozmo/jsQR)
- [ZXing Browser](https://github.com/zxing-js/browser)
- [Android ACTION_VIEW](https://developer.android.com/reference/android/content/Intent#ACTION_VIEW)
- [Android: enviar conteúdo](https://developer.android.com/training/sharing/send)
- [Chrome: Android intents](https://developer.chrome.com/docs/android/intents)
- [Android deep links](https://developer.android.com/training/app-links/deep-linking)
- [Web Share API](https://www.w3.org/TR/web-share/)
- [Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)
- [Apple Universal Links](https://developer.apple.com/documentation/xcode/supporting-universal-links-in-your-app)
- [Apple custom URL schemes](https://developer.apple.com/documentation/xcode/defining-a-custom-url-scheme-for-your-app)
- [Banco Central: Manual do BR Code](https://www.bcb.gov.br/content/estabilidadefinanceira/spb_docs/ManualBRCode.pdf)
- [Banco Central: iniciação do Pix](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf)
