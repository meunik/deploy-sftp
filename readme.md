# 🚀 deploy-sftp

Um CLI para automação de deploy de projetos Vue.js via Git e SFTP.  
Ele faz build, gerencia tags/branches e envia os arquivos para servidores de desenvolvimento e produção.

---

## 📋 Sumário

- [🚀 deploy-sftp](#-deploy-sftp)
  - [📋 Sumário](#-sumário)
  - [🔍 Recursos](#-recursos)
  - [⚙️ Pré-requisitos](#️-pré-requisitos)
  - [📥 Instalação](#-instalação)
  - [🔧 Configuração](#-configuração)
  - [🚀 Uso](#-uso)
    - [Via npx / NPX](#via-npx--npx)
    - [Com pacote instalado globalmente](#com-pacote-instalado-globalmente)
    - [Como script no `package.json`](#como-script-no-packagejson)
  - [⚙️ Fluxo de Deploy](#️-fluxo-de-deploy)
  - [🛠️ Exemplos](#️-exemplos)
  - [📄 Licença](#-licença)
  - [😁 Feito por Marcos Paulo](#-feito-por-marcos-paulo)

---

## 🔍 Recursos

- Seleção de ambiente (todos / dev / prod) via menu interativo  
- Build do projeto (`yarn build` ou `npm run build`)  
- Fluxo Git: clone em diretório temporário, commit, tag e push  
- Upload de diretórios via SFTP com feedback em tempo real  
- Gerencia versões usando tags sem sair do terminal  

---

## ⚙️ Pré-requisitos

- Node.js ≥ 14  
- Yarn ou npm  
- Acesso Git ao repositório remoto  
- Acesso SFTP ao servidor de destino  

---

## 📥 Instalação

Instale globalmente para usar o comando `deploy-sftp` de qualquer lugar:

```bash
npm install -g deploy-sftp
# ou
yarn global add deploy-sftp
```

Ou adicione como dependência de desenvolvimento:

```bash
npm install --save-dev deploy-sftp
# ou
yarn add --dev deploy-sftp
```

> Todas as dependências (`dotenv`, `ssh2-sftp-client`, `yargs`, `inquirer`, `ora`) são instaladas automaticamente pelo npm/yarn.

---

## 🔧 Configuração

1. Na raiz do seu projeto Vue, crie um arquivo `.env` com as variáveis abaixo.  
2. Ajuste valores de URL do repositório, credenciais Git e SFTP.

```dotenv
# Repositório Git
VITE_REPO_URL=https://github.com/usuario/projeto.git
VITE_GIT_EMAIL=seu-email@exemplo.com
VITE_GIT_USER=Seu Nome

# Build
VITE_BUILD_FOLDER=dist

# Ambiente DEV
VITE_FTP_HOST_DEV=dev.exemplo.com
VITE_FTP_PORT_DEV=22
VITE_FTP_USER_DEV=usuario_dev
VITE_FTP_PASS_DEV=senha_dev
VITE_FTP_DIRR_DEV=/var/www/dev

# Ambiente PROD
VITE_FTP_HOST_PROD=prod.exemplo.com
VITE_FTP_PORT_PROD=22
VITE_FTP_USER_PROD=usuario_prod
VITE_FTP_PASS_PROD=senha_prod
VITE_FTP_DIRR_PROD=/var/www/prod
```

> **Importante:**  
> - `VITE_BUILD_FOLDER` deve ser o diretório gerado pelo `yarn build`.  
> - `VITE_REPO_URL` pode ser HTTPS ou SSH. Se for Bitbucket HTTPS, o script converterá para SSH automaticamente.

---

## 🚀 Uso

### Via npx / NPX

```bash
npx deploy-sftp
```

### Com pacote instalado globalmente

```bash
deploy-sftp
```

### Como script no `package.json`

Adicione em `"scripts"`:

```json
{
  "scripts": {
    "deploy": "deploy-sftp"
  }
}
```

E então:

```bash
npm run deploy
# ou
yarn deploy
```

---

## ⚙️ Fluxo de Deploy

1. Menu interativo para escolher ambiente: `todos`, `dev` ou `prod`.  
2. Executa build do Vue (`yarn build`).  
3. Clona branch alvo em pasta temporária.  
4. Substitui conteúdo por build atual.  
5. Configura Git (usuário/email).  
6. Seleciona ou cria nova tag.  
7. Commit + tag + push para repositório remoto.  
8. Realiza upload dos arquivos build via SFTP.  
9. Remove pasta temporária e encerra.

---

## 🛠️ Exemplos

```bash
# Deploy somente em dev
deploy-sftp
# Selecionar 'dev' no menu

# Deploy em todos os ambientes
deploy-sftp
# Selecionar 'todos' no menu
```

---

## 📄 Licença

Unlicense  

## 😁 Feito por [Marcos Paulo](https://marcospaulo.dev)  
https://marcospaulo.dev
