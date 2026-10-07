# Live Radar & Twitch Pins

Duas extensões independentes para o Brave e navegadores compatíveis com Chromium. Cada projeto tem sua própria pasta, manifesto e guia de instalação.

| Projeto | O que faz | Arquivos e guia |
| --- | --- | --- |
| **Live Radar** | Notifica quando canais da Twitch e do YouTube entram ao vivo, com ações para ignorar, assistir ou abrir de fundo com áudio mudo. | [live-radar](live-radar/README.md) |
| **Twitch Pins** | Fixa canais acima dos seguidos na Twitch, com alfinete compacto e olhinho para recolher a lista. | [twitch-pins](twitch-pins/README.md) |

## Instalar no Brave

1. Baixe o repositório em **Code → Download ZIP** e extraia os arquivos.
2. Abra `brave://extensions` e ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha `live-radar` ou `twitch-pins`.
4. Recarregue as abas já abertas. Para instalar as duas, repita o passo anterior com a outra pasta.

Não é necessário compilar nem instalar dependências. A Live Radar exige configurar a conexão com a Twitch para monitorar essa plataforma; veja seu guia. A Twitch Pins salva os favoritos localmente e não precisa dessa conexão.

Para atualizar uma extensão existente sem perder as configurações locais, copie os arquivos novos para a mesma pasta da instalação anterior, recarregue a extensão no Brave e recarregue as abas.

## Testes

Com Node.js 20 ou superior, na raiz:

```sh
npm test
```

Também é possível executar `npm test` dentro da pasta de cada projeto. Os testes usam respostas simuladas e não exigem contas ou credenciais reais. Os guias de cada extensão descrevem as validações e limitações da integração com os sites.
