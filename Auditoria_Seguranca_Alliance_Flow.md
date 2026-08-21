# Auditoria de Segurança — Alliance Flow

Análise do código de produção (backend Node/Express + SQLite no Render, frontend React no Vercel, arquivos no Cloudinary). Foco: risco de invasão e risco de perda de dados.

## Resumo

O sistema está bem construído nos pontos que mais importam. Login, controle de acesso, proteção contra os ataques mais comuns (SQL injection, XSS) e armazenamento de senhas/segredos estão implementados corretamente — não encontrei nenhuma falha crítica nem nada que exponha dados agora. Os pontos abaixo são de reforço (deixar um sistema bom ainda mais resistente), não correções de emergência.

## O que já está protegido

**Login e sessões.** Senhas são armazenadas com bcrypt (hash com salt, não texto puro nem criptografia reversível). Sessões usam tokens aleatórios de 32 bytes guardados no banco — não são JWT, então revogar acesso de alguém é simplesmente apagar a sessão, sem risco de token "eterno". Sessões expiram sozinhas depois de 14 dias sem uso, e a conta é bloqueada por 15 minutos após 5 senhas erradas seguidas, o que impede tentativa de adivinhação por força bruta.

**Controle de acesso por pessoa.** Cada um dos 9 usuários só enxerga e edita as telas liberadas para ele (`permissions.js`), com bloqueio no backend, não só na tela — ou seja, mesmo que alguém tente chamar a API diretamente, o servidor recusa. Quem não está na lista de permissões não tem acesso a nada por padrão.

**Injeção de SQL.** As 160 consultas ao banco no `server.js` usam todas parâmetros preparados (`db.prepare(...).run(valor)`), a forma correta e segura de montar consultas. Não encontrei nenhum caso de texto do usuário sendo colado diretamente numa query SQL, que é o erro clássico que permite invasão via SQL injection.

**Injeção de HTML/XSS.** Todo texto do usuário que entra nos PDFs (contratos, faturas, packing list) passa por uma função de escape antes de virar HTML. O frontend em React também escapa conteúdo automaticamente e não usa nenhum atalho perigoso (`dangerouslySetInnerHTML` ou `eval`) em lugar nenhum do código.

**Segredos e credenciais.** Não há nenhuma chave de API, senha ou segredo escrito diretamente no código. As credenciais do Cloudinary vêm de variáveis de ambiente, o arquivo `.env` está no `.gitignore` e nunca foi commitado — só existe um `.env.production.example` de referência, sem valores reais.

**Perda de dados.** O banco SQLite roda em `/data/pedidos.db` em produção, que é o caminho de um disco persistente do Render — os dados sobrevivem a reinícios e a novos deploys. Além disso, o Render tira automaticamente um snapshot desse disco a cada 24 horas e guarda por pelo menos 7 dias, com restauração pelo painel em caso de corrupção ou perda ([documentação oficial](https://render.com/docs/disks)). As fotos e vídeos de produtos/amostras ficam no Cloudinary, um serviço externo com sua própria redundância — não dependem do disco do Render.

## Pontos de atenção (recomendados, não urgentes)

Nenhum destes é uma porta aberta para invasão hoje — são reforços que valem a pena.

**Sem limite de requisições (rate limiting) nas rotas em geral.** O login já tem proteção (bloqueio após 5 tentativas), mas as demais rotas da API não têm limite de quantas vezes podem ser chamadas por segundo. Para uma equipe de 9 pessoas isso é baixo risco, mas protege contra abuso ou uso indevido de um token vazado. Recomendo adicionar o pacote `express-rate-limit`.

**Backup fora do Render.** Hoje a única cópia de segurança do banco é o snapshot automático do próprio Render. Isso cobre bem casos de corrupção do disco, mas não cobre, por exemplo, perda de acesso à conta Render ou exclusão acidental do serviço. Vale ter uma segunda cópia independente — por exemplo, um script simples que exporta o banco semanalmente para o Cloudinary ou outro armazenamento, como camada extra de segurança para "informações muito importantes que não podem ser perdidas".

**Dependências desatualizadas.** O `package.json` do backend fixa Express na versão 4.18.3, que tem uma falha de baixo risco já corrigida (redirecionamento aberto, CVE-2024-29041). Vale atualizar para 4.19.2 ou mais recente. Também não há `package-lock.json` commitado no repositório, o que significa que cada deploy pode instalar versões ligeiramente diferentes das dependências — recomendo gerar e commitar esse arquivo para builds mais previsíveis.

**Cabeçalhos de segurança do navegador.** O backend não usa o pacote `helmet`, que adiciona proteções extras (como forçar HTTPS e travar certos tipos de ataque no navegador) com poucas linhas de código. Não é crítico porque o Render já cuida de HTTPS na borda, mas é uma adição barata.

**Mensagens de erro.** Algumas rotas devolvem `err.message` diretamente para quem fez a requisição quando algo falha. Como é um sistema interno de 9 pessoas, o risco é baixo, mas idealmente essas mensagens deveriam ficar só no log do servidor, não na resposta.

## Conclusão

A base do sistema — autenticação, permissões, proteção contra SQL injection/XSS e sigilo de credenciais — está sólida e não precisa de correção. Os itens da seção de atenção são melhorias incrementais; o mais importante deles, dado que você mencionou informações que não podem ser perdidas, é ter uma segunda cópia de backup fora do Render.
