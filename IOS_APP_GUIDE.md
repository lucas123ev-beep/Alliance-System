# Alliance Flow no iOS — guia passo a passo

Este guia parte de onde eu parei: o projeto já está configurado pra virar um
app iOS (via [Capacitor](https://capacitorjs.com), que empacota o mesmo
`frontend/App.jsx` que já existe — não é um app separado, é o mesmo site
rodando dentro de um app nativo). Faltam as partes que só dá pra fazer no seu
Mac com Xcode e com sua conta Apple Developer.

## O que já está pronto no código

- `frontend/capacitor.config.json` — configuração do app (nome, ID, cor de fundo)
- `frontend/resources/icon.png` — ícone 1024x1024 (logo HKAG)
- `frontend/resources/splash.png` e `splash-dark.png` — tela de abertura
- `frontend/package.json` — scripts `ios:build` e `ios:open`, dependências do Capacitor já listadas
- `frontend/.env.production.example` — modelo pra você copiar

## Passo 1 — Conta Apple Developer

Você ainda não tem. Precisa:

1. Ir em [developer.apple.com/programs](https://developer.apple.com/programs/enroll/)
2. Entrar com seu Apple ID (ou criar um novo, se preferir um separado pra empresa)
3. Se for cadastrar como empresa (Hong Kong Alliance Global Trading Co. Ltd), escolha "Organization" — vai pedir D-U-N-S Number da empresa (se não tiver, dá pra solicitar grátis no mesmo fluxo, mas pode levar alguns dias). Se for mais rápido, dá pra começar como "Individual" (seu nome pessoal) e trocar depois.
4. Paga a taxa anual (US$ 99)
5. Aprovação normalmente sai em 24–48h (organização pode levar mais, por causa do D-U-N-S)

**Só depois disso os próximos passos funcionam** (o Xcode precisa da conta pra assinar o app).

## Passo 2 — Preparar o projeto no seu Mac

Com o Xcode já instalado, no Terminal:

```bash
git pull
cd frontend
npm install
```

Copie o arquivo de variável de ambiente:

```bash
cp .env.production.example .env.production
```

(o valor já vem certo, apontando pro backend em produção — só confirme que bate com a URL atual do Render)

Agora adicione a plataforma iOS (só precisa rodar isso uma vez):

```bash
npx cap add ios
```

Isso cria uma pasta `frontend/ios/` com o projeto Xcode completo — não mexo nisso pelo código, é gerado automaticamente pela ferramenta.

Depois, sempre que quiser atualizar o app com mudanças novas do site:

```bash
npm run ios:build
npm run ios:open
```

O segundo comando abre o Xcode automaticamente.

## Passo 3 — Configurar no Xcode

Com o Xcode aberto:

1. No painel esquerdo, clique no projeto "App" (ícone azul, topo da árvore)
2. Na aba **Signing & Capabilities**:
   - Marque **Automatically manage signing**
   - Em **Team**, selecione sua conta Apple Developer (aparece na lista depois que você logar no Xcode com seu Apple ID em Xcode → Settings → Accounts)
   - **Bundle Identifier**: já vem `co.hkag.allianceflow` — pode manter ou trocar por outro (só precisa ser único, formato `algo.algo.algo`)
3. Ícone e splash screen: o Xcode já vai puxar os arquivos de `frontend/resources/` automaticamente quando você rodar `npx cap sync` — se não aparecer, me avisa que ajudo a resolver
4. Pra testar: escolha um simulador de iPhone no topo da tela e aperte ▶️ (Run) — o app deve abrir e mostrar a tela de login do Alliance Flow

## Passo 4 — Enviar para a App Store

1. No Xcode, com um dispositivo genérico selecionado (não um simulador — escolha **"Any iOS Device"** no seletor do topo)
2. Menu **Product → Archive**
3. Quando terminar, abre a janela de **Organizer** → clique **Distribute App** → **App Store Connect** → siga o assistente (usa as credenciais da sua conta Developer automaticamente)

## Passo 5 — Cadastrar o app na App Store Connect

Em [appstoreconnect.apple.com](https://appstoreconnect.apple.com):

1. **Minhas Apps → +　→ Novo App**
2. Nome, Bundle ID (o mesmo do Xcode), idioma principal
3. Preencher: descrição, categoria (provavelmente "Negócios"), capturas de tela (o Xcode/Simulador tira essas pra você), ícone (já embutido no build), classificação etária, política de privacidade (precisa de uma URL — se não tiver uma página pronta, me avisa que eu escrevo o texto e você só hospeda)
4. Selecionar o build que você acabou de enviar (Passo 4) — pode levar alguns minutos pra aparecer disponível
5. Enviar para revisão

A revisão da Apple costuma levar de 1 a 3 dias.

## Ponto de atenção importante — downloads de PDF/Excel

O sistema usa `window.open()` pra abrir/baixar Proforma, Commercial Invoice,
Packing List, Payment Notice, relatórios etc. Isso funciona perfeitamente no
navegador (Vercel), mas dentro do app nativo (WKWebView) pode não abrir
nada, já que não existe "nova aba" num app.

**Não mexi nisso ainda de propósito** — é uma mudança que só quero fazer
depois que a base do app estiver rodando e testada no seu Mac, pra não
arriscar quebrar o site (que está em produção agora) numa mudança que eu não
consigo testar daqui. Quando você tiver o app rodando no simulador, testa um
botão de PDF — se não abrir nada, me avisa que eu ajusto usando o plugin
`@capacitor/browser` (abre num navegador interno dentro do próprio app).
