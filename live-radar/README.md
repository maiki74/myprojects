# Live Radar para Brave

Extensão Manifest V3 que acompanha uma lista de streamers da Twitch e de canais do YouTube. Ao detectar uma nova transmissão, mostra um aviso na aba em uso com **Ignorar**, **De fundo, mudo** e **Assistir**. Não depende de um servidor próprio.

## Instalar

1. Baixe este projeto e extraia o ZIP, se necessário.
2. Abra `brave://extensions` e ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta que contém `manifest.json`.
4. Fixe **Live Radar** na barra do navegador e abra **Configurações**.
5. Adicione os canais, um por linha, e salve. Recarregue as abas que já estavam abertas antes da instalação para ativar os avisos dentro delas.
6. Use **Testar aviso** e abra uma página comum HTTP/HTTPS para conferir os três botões.

Não há instalação de pacotes nem compilação. A pasta da extensão deve permanecer no disco enquanto estiver instalada.

## Twitch

A API oficial exige um Client ID e uma conexão OAuth. O projeto não inclui credenciais compartilhadas.

1. Acesse <https://dev.twitch.tv/console/apps>, habilite autenticação em duas etapas na conta e registre uma aplicação.
2. Escolha **Browser Extension** como categoria, se disponível. Esta extensão usa o fluxo OAuth implícito; mantenha **Confidential** como tipo da aplicação para esse fluxo (o tipo **Public** é destinado ao fluxo de código de dispositivo da Twitch). O fluxo implícito não usa Client Secret: não gere, compartilhe ou inclua esse segredo na extensão. Copie a URL OAuth exibida nas configurações da extensão para a lista de URLs de redirecionamento da aplicação. Cada instalação pode ter um ID diferente; use a URL mostrada na sua instalação.
3. Cole o **Client ID**, salve e clique em **Conectar Twitch**. Autorize a conexão na janela da Twitch.
4. Informe os logins dos streamers, como `alanzoka`, ou os links dos canais.

O fluxo de autorização implícita não usa Client Secret e não solicita permissões adicionais de chat ou gerenciamento da conta. O token é validado ao iniciar o navegador e pelo menos a cada hora enquanto houver canais Twitch configurados. Ele fica somente no armazenamento local da extensão e não é sincronizado. Quando expirar ou for revogado, o painel pede uma nova conexão. **Desconectar** revoga o token na Twitch.

## YouTube

Adicione `@identificador`, `https://www.youtube.com/@identificador` ou a URL `https://www.youtube.com/channel/UC…`.

A extensão consulta a página pública `/live` do canal e confirma `isLiveNow` nos dados do player. Também reconhece páginas que apresentam uma aba de lives em vez de redirecionar para a transmissão. Não precisa de chave de API. Ela não executa scripts dessas páginas. O dono da transmissão precisa corresponder ao canal da lista; recomendações de outros canais não geram avisos. Quando necessário, resolve o @identificador pelos metadados da página do próprio canal. Se o YouTube não confirmar um identificador, use o ID `UC…`.

Este mecanismo depende do formato público do YouTube. Páginas de consentimento, mudanças de formato, limites de acesso e lives privadas, restritas ou exclusivas para membros podem impedir a detecção. Erros aparecem no painel e preservam o último estado conhecido; um canal com erro não é automaticamente considerado offline. O painel pode, portanto, exibir um estado antigo enquanto a consulta falha.

## Comportamento dos avisos

- **Ignorar:** remove o aviso de todas as abas e não abre a transmissão.
- **De fundo, mudo:** cria uma nova aba sem foco, silencia a aba antes de navegar e carrega a transmissão. A política de reprodução automática do Brave ou do site pode exigir iniciar o player manualmente.
- **Assistir:** abre a transmissão em uma nova aba ativa.
- O painel da extensão mostra o último estado conhecido dos canais. Também permite abrir uma live cujo aviso já foi ignorado.
- Cada transmissão gera apenas um aviso, inclusive após a reinicialização do navegador. Uma nova transmissão do mesmo canal gera outro aviso.
- O padrão de consulta é **2 minutos**, configurável entre 1 e 60. Não é uma notificação instantânea: suspensão do computador, rede e economia de energia do navegador podem atrasar o aviso. O Brave precisa estar aberto.
- Mostra os três avisos mais recentes na aba visível; avisos pendentes mais antigos reaparecem ao ignorar os recentes. Guarda no máximo 20 avisos por até 6 horas.
- Notificações do sistema possuem dois botões: **Assistir** e **De fundo, mudo**. Fechar o aviso equivale a ignorar. O suporte a botões varia conforme o sistema operacional e suas configurações de notificações.
- Páginas internas (`brave://`, `chrome://`), lojas de extensões, páginas de outras extensões e PDFs integrados não aceitam avisos injetados; use as notificações do sistema. Em janela anônima, só funciona se você autorizar a extensão nesse modo.

## Permissões e privacidade

`storage` guarda listas, conexão e estado; `alarms` agenda consultas; `notifications` cria avisos do sistema; `tabs` encontra abas para avisá-las e abre/silencia transmissões; `identity` permite conectar a Twitch. O script executa em páginas HTTP/HTTPS para desenhar os avisos, mas não lê nem envia o conteúdo das páginas visitadas. Os títulos dos streamers são exibidos como texto, sem interpretar HTML.

Os únicos serviços externos consultados são `api.twitch.tv`, `id.twitch.tv` e `www.youtube.com`. Ao clicar para assistir, o Brave acessa o site correspondente normalmente. Não há analytics ou coleta em servidor próprio. A extensão não desativa Brave Shields; se a rede bloquear um serviço, o erro aparece no painel.

## Desenvolvimento e validação

Com Node.js 20 ou superior, execute:

```sh
cd live-radar
npm test
```

Os testes cobrem reconhecimento de lives, lives agendadas, identificação do dono do canal, deduplicação, reinício do worker, erros de rede, autorização, isolamento de configurações, pausa durante consulta e ordem de abertura/silenciamento. Usam respostas simuladas e não dependem de contas ou credenciais reais.

Para testar no navegador, carregue a pasta como extensão, use **Testar aviso** e confirme as três ações em uma página comum. Depois configure um canal que esteja realmente ao vivo e clique em **Verificar agora**. A autenticação Twitch e a detecção real do YouTube precisam dessa validação na sua instalação.

### Validação neste ambiente

Os testes automatizados passaram. A interface de configurações, o popup e os três botões dos avisos foram exercitados em Chromium com as APIs da extensão simuladas. A política administrativa do Chromium deste ambiente bloqueia extensões sem compactação; a instalação completa da extensão não pôde ser verificada aqui. A rede do ambiente também bloqueou a consulta pública ao YouTube. Não foi realizada autenticação com uma conta Twitch nem confirmada a detecção de uma transmissão real. Essas verificações precisam ser concluídas no Brave do usuário.
