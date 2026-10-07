# Twitch Pins para Brave

Extensão separada da Live Radar. Adiciona uma seção **FIXADOS** acima dos canais seguidos na barra lateral da Twitch, inclusive na página inicial. Permite experimentar um streamer antes de decidir seguir. Não executa seguir, deixar de seguir, inscrever-se ou cancelar inscrição.

## Instalar

1. Extraia `twitch-pins.zip`.
2. Abra `brave://extensions` e ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta `twitch-pins`, que contém o manifesto desta extensão. A extensão Live Radar fica na pasta separada `live-radar`.
4. Recarregue as abas abertas da Twitch. Fixe o ícone **Twitch Pins** na barra do Brave.

Não precisa de pacotes, compilação, conta de desenvolvedor, chave de API nem autorização de login. A pasta deve permanecer no disco enquanto a extensão estiver instalada.

## Usar

- Abra um canal da Twitch. O botão com **ícone de alfinete**, sem texto, aparece alinhado na mesma linha das ações **Seguir/Inscrever-se**, quando o layout da Twitch permite. Clique para fixar; o alfinete fica destacado. Clique novamente para desafixar. O nome da ação aparece ao passar o mouse e fica disponível para leitores de tela.
- Se o cabeçalho não for reconhecido, o mesmo botão aparece no canto inferior direito da página do canal.
- Os fixados aparecem antes dos seguidos na barra lateral. Clique no canal para abri-lo ou em **×** para desafixar. A lista mantém a ordem escolhida, com novos fixados no topo.
- Use o **olhinho** no título da seção para recolher ou expandir os fixados. A preferência fica salva e acompanha as outras abas. Recolher não remove os canais, e o olhinho continua disponível com a barra lateral estreita.
- Abra o ícone da extensão ou a engrenagem da seção para adicionar um canal pelo login/link e usar **↑ / ↓** para organizar a lista.
- Na barra lateral recolhida, os fixados aparecem como avatares; passe o mouse para ver nome e estado. Em telas sem barra lateral, use o painel da extensão.
- Aceita até **50 canais**. A lista fica salva localmente, persiste entre reinicializações e é atualizada nas outras abas da Twitch. Não é sincronizada entre dispositivos ou perfis do navegador.

## Status

Consulta os canais a cada **2 minutos**, enquanto o Brave está aberto, e mostra **Ao vivo**, **Offline**, **Verificando** ou **Status indisponível**. Nos canais ao vivo, a barra lateral mostra a **quantidade de espectadores**, o **jogo/categoria** e o **título da live**. Textos longos são cortados com reticências, e o conteúdo completo aparece ao passar o mouse. Esses dados também aparecem no painel. O ícone da extensão exibe a quantidade de canais com estado confirmado ao vivo.

Guarda apenas o estado atual dos canais. Erros de rede não tornam um canal automaticamente offline: a interface sinaliza indisponibilidade e mantém o último estado conhecido.

## Atualizar para 1.2.1

Extraia os arquivos novos sobre a **mesma pasta** usada na instalação anterior, clique em **Recarregar** no cartão da extensão em `brave://extensions` e recarregue as abas da Twitch. Usar a mesma pasta mantém o identificador da extensão e os canais salvos. A versão 1.2.1 mantém os textos dentro da barra lateral e do painel, usa reticências nos textos longos e abrevia números grandes de espectadores. Passe o mouse para ver os valores e textos completos. O olhinho, os fixados e sua ordem são preservados.

## Compatibilidade e privacidade

A lista e os botões são desenhados por scripts restritos a `twitch.tv`. `storage` salva os fixados, o estado atual e a preferência do olhinho; `alarms` agenda consultas. A permissão de rede para `gql.twitch.tv` permite consultas **somente de leitura** ao endpoint usado pelo site público da Twitch, com o identificador público do próprio site. Esse identificador não é uma senha nem um token pessoal. A extensão não extrai cookies, intercepta credenciais, solicita escopos de conta, modifica seguidores ou envia dados para um servidor próprio.

O endpoint do site é **não oficial para extensões** e pode mudar ou bloquear consultas. Alterações no layout também podem exigir manutenção dos seletores da barra lateral e dos botões. Fixar/desafixar e organizar continuam funcionando localmente caso o serviço de status falhe. Não desative Brave Shields para usar a extensão; consulte os erros exibidos no painel.

## Desenvolvimento e validação

Na pasta `twitch-pins`, com Node.js 20+ (não é necessário instalar dependências):

```sh
npm test
```

Os testes de Twitch Pins verificam normalização de canais, limite e ordem da lista, persistência do olhinho, migração sem perda de fixados, consultas, erros de rede e alterações durante uma consulta. Não dependem de contas reais.

Para validar no Brave, abra um canal, use o alfinete, volte à página inicial e confirme sua posição acima dos seguidos. Teste o olhinho, sua persistência depois de recarregar, desafixar, organizar pelo painel, recolher a barra lateral e navegar entre canais sem recarregar a página. Fixe um canal realmente ao vivo e outro offline e use **Atualizar** para confirmar os status.

O Chromium da máquina de desenvolvimento bloqueia carregar extensões por política administrativa e a rede bloqueia `gql.twitch.tv`. A integração com a Twitch real precisa ser conferida na instalação do usuário. Os testes no navegador usam uma página representativa da Twitch e APIs simuladas; não comprovam compatibilidade com todas as variantes atuais do site.
