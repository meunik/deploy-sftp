/**
 * Script de deploy para projetos Vue.js
 * 
 * Instalar Dependencias: yarn add dotenv ssh2-sftp-client yargs --dev
 * Adicionar `"deploy": "node deploy.js"` ao package.json na seção de "scripts"
 * 
 * Comandos:
 * - yarn deploy --dev: Faz deploy para o ambiente de desenvolvimento
 * - yarn deploy --prod: Faz deploy para o ambiente de produção
 * - yarn deploy: Faz deploy para os ambientes de desenvolvimento e produção
 *
 */
(async function () {
  const isESM = typeof import.meta !== 'undefined';

  const fs = isESM ? (await import('fs')).default : require('fs');
  const path = isESM ? (await import('path')).default : require('path');
  const { execSync } = isESM ? (await import('child_process')).default : require('child_process');
  const Client = isESM ? (await import('ssh2-sftp-client')).default : require('ssh2-sftp-client');
  const { Client: SSHClient } = isESM ? (await import('ssh2')).default : require('ssh2');
  const readline = isESM ? (await import('readline')).default : require('readline');
  const yargs = isESM ? (await import('yargs')).default : require('yargs');
  const dotenv = isESM ? (await import('dotenv')).default : require('dotenv');
  const { fileURLToPath } = isESM ? (await import('url')).default : require('url');
  const { dirname } = isESM ? (await import('path')).default : require('path');

  dotenv.config();

  const __filename = isESM ? fileURLToPath(import.meta.url) : __filename;
  const __dirname = isESM ? dirname(__filename) : __dirname;

  try {
    require.resolve('dotenv');
    require.resolve('ssh2-sftp-client');
    require.resolve('yargs');
  } catch (err) {
    console.error('Erro: Certifique-se de que as dependências necessárias estão instaladas.');
    console.error('Execute: yarn add dotenv ssh2-sftp-client yargs --dev');
    process.exit(1);
  }

  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error(`Erro: O arquivo .env não foi encontrado no caminho: ${envPath}`);
    process.exit(1);
  }

  // Variáveis de ambiente obrigatórias
  const varEnvObrigatorias = [
    'VITE_BUILD_FOLDER',
    'VITE_REPO_URL',

    'VITE_FTP_HOST_DEV',
    'VITE_FTP_PORT_DEV',
    'VITE_FTP_USER_DEV',
    'VITE_FTP_PASS_DEV',
    'VITE_FTP_DIRR_DEV',

    'VITE_FTP_HOST_PROD',
    'VITE_FTP_PORT_PROD',
    'VITE_FTP_USER_PROD',
    'VITE_FTP_PASS_PROD',
    'VITE_FTP_DIRR_PROD',
  ];
  const varEnvFaltantes = varEnvObrigatorias.filter((varName) => !process.env[varName]);

  if (varEnvFaltantes.length > 0) {
    console.error('Erro: As seguintes variáveis de ambiente estão ausentes no arquivo .env:');
    console.error(varEnvFaltantes.join(', '));
    process.exit(1);
  }

  const argv = yargs(process.argv.slice(2)).argv;

  new Service({
    fs,
    path,
    __dirname,
    argv,
    sftp: new Client(),
    ssh: new SSHClient(),
    execSync,
    readline,
  });
})();

class Service {
  #fs;
  #path;
  #argv;
  #sftp;
  #execSync;
  #readline;
  #GIT_BRANCH_DEV;
  #GIT_BRANCH_PROD;
  #DIST_FOLDER;
  #REPO_URL;
  #LOCAL_DIR;
  #CONFIG_DEV;
  #CONFIG_PROD;
  #REMOTE_DEV;
  #REMOTE_PROD;
  #IGNORE_DIR;

  constructor({
    fs,
    path,
    __dirname,
    argv,
    sftp,
    execSync,
    readline,
  }) {
    this.#fs = fs;
    this.#path = path;
    this.#argv = argv;
    this.#sftp = sftp;
    this.#execSync = execSync;
    this.#readline = readline;

    this.#GIT_BRANCH_DEV = process.env.GIT_BRANCH_DEV || 'dev';
    this.#GIT_BRANCH_PROD = process.env.GIT_BRANCH_PROD || 'prod';
    this.#DIST_FOLDER = process.env.VITE_BUILD_FOLDER;
    this.#REPO_URL = process.env.VITE_REPO_URL;

    this.#LOCAL_DIR = path.join(__dirname, this.#DIST_FOLDER);

    this.#CONFIG_DEV = {
        host: process.env.VITE_FTP_HOST_DEV,
        port: process.env.VITE_FTP_PORT_DEV || 22,
        username: process.env.VITE_FTP_USER_DEV,
        password: process.env.VITE_FTP_PASS_DEV
    };

    this.#CONFIG_PROD = {
        host: process.env.VITE_FTP_HOST_PROD,
        port: process.env.VITE_FTP_PORT_PROD || 22,
        username: process.env.VITE_FTP_USER_PROD,
        password: process.env.VITE_FTP_PASS_PROD,
    };

    this.#REMOTE_DEV = process.env.VITE_FTP_DIRR_DEV;
    this.#REMOTE_PROD = process.env.VITE_FTP_DIRR_PROD;

    // Lista de diretórios a serem ignorados
    this.#IGNORE_DIR = process.env.IGNORE_DIR || ['1BKP', 'serve', 'server', 'painel', '.git'];

    this.#main()
  }

  async #msg(tipo, mensagem = '', erro = null) {
    switch (tipo) {
      case 'info': console.log(`\x1b[94m●\x1b[0m \x1b[34m${mensagem}\x1b[0m`); break;
      case 'title': console.log(`\x1b[94m●\x1b[0m \x1b[34m${mensagem}\x1b[0m\x1b[90m...\x1b[0m`); break;
      case 'sucesso': console.log(`\x1b[92m✓\x1b[0m \x1b[32m${mensagem}\x1b[0m`); break;
      case 'erro': console.error(`\x1b[91m✗\x1b[0m \x1b[31m${mensagem}\x1b[0m: `, erro); break;
      case 'loading': console.log('\x1b[90m    ...\x1b[0m'); break;
      case 'loading2': process.stdout.write(`\x1b[90m●\x1b[0m `); break;
    }
  }
  
  async #execCommand(comando, errorMsg, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        this.#execSync(comando, { stdio: 'inherit', ...options });
        resolve();
      } catch (error) {
        this.#msg('erro', errorMsg, error);
        process.exit(1);
      }
    });
  }
  
  async #versao(branch, distOptions) {
    try {
      this.#execSync(`git rev-parse --verify ${branch}`, { stdio: 'inherit', ...distOptions });
      await this.#execCommand(`git checkout ${branch}`, `Erro ao entrar a branch ${branch}`, distOptions);
      const lastCommitBuffer = this.#execSync(`git log -1 --pretty=%B`, { stdio: 'pipe', ...distOptions });
      const lastCommit = lastCommitBuffer ? lastCommitBuffer.toString().trim() : '';
      let [primeiro, segundo] = lastCommit.split('.').map(Number);
      if (isNaN(primeiro) || isNaN(segundo)) {
        primeiro = 1;
        segundo = 1;
      } else {
        segundo += 1;
      }
      const defaultCommit = `${primeiro}.${segundo}`;
      const rl = this.#readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
  
      async function askVersion() {
        return new Promise((resolve) => {
          rl.question(`Qual será a versão? (Padrão: n.n) (Recomendado: ${defaultCommit}): `, async (input) => {
            const versionPattern = /^\d+\.\d+$/;
            if (versionPattern.test(input) || input === '') {
              const commitMessage = input || defaultCommit;
              rl.close();
              resolve(commitMessage);
            } else {
              this.#msg('erro', 'Formato inválido. Por favor, insira um valor no formato padrão n.n');
              await askVersion();
              resolve();
            }
          });
        });
      }
  
      const commitMessage = await askVersion();
      return commitMessage;
    } catch (error) {
      console.log(error);
      this.#msg('title', `Branch criada: ${branch}`);
      await this.#execCommand(`git checkout -b ${branch}`, `Erro ao criar a branch ${branch}`, distOptions);
      return '1.1'
    }
  }
  
  async #reset(branch, distOptions) {
    try {
      this.#execSync(`git rev-parse --verify ${branch}`, { stdio: 'inherit', ...distOptions });
      await this.#execCommand(`git reset --hard origin/${branch}`, 'Erro:', distOptions);
      await this.#execCommand(`git clean -fd`, 'Erro:', distOptions);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  async #deployToBranch(branch) {
    const distOptions = { cwd: this.#DIST_FOLDER };
    let currentBranch = null;
  
    try {
      currentBranch = this.#execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
      this.#msg('title', `Branch atual: ${currentBranch}`);
    } catch (error) {
      this.#msg('erro', 'Nenhuma branch encontrada', error);
    }
  
    // Verifica se a pasta dist existe, se não, cria
    if (!this.#fs.existsSync(this.#DIST_FOLDER)) {
      this.#msg('title', `Criando a pasta ${this.#DIST_FOLDER}`);
      this.#fs.mkdirSync(this.#DIST_FOLDER, { recursive: true });
    }
  
    await this.#execCommand('git init', 'Erro ao iniciar o repositório Git', distOptions);
    try {
      const remotes = this.#execSync('git remote', { ...distOptions }).toString().trim().split('\n');
      if (!remotes.includes('origin')) {
        this.#msg('title', `Adicionando o repositório remoto`);
        await this.#execCommand(
          `git remote add origin ${this.#REPO_URL}`,
          'Erro ao adicionar o repositório remoto',
          distOptions
        );
      }
    } catch (error) {
      this.#msg('erro', 'Erro ao verificar os remotes', error);
    }
  
    await this.#execCommand(`git fetch origin`, 'Erro:', distOptions);
    await this.#reset(branch, distOptions);
    this.#msg('title', `Mudando para branch: ${branch}`);
    const commitMessage = await this.#versao(branch, distOptions);
    await this.#build();
  
    await this.#execCommand('git add .', 'Erro ao adicionar os arquivos ao Git', distOptions);
    await this.#execCommand(`git commit --allow-empty -m "${commitMessage}"`, 'Erro ao commitar os arquivos', distOptions);
    this.#msg('title', `Push do commit com a versão: ${commitMessage}`);
    await this.#execCommand(`git push -u --force origin ${branch}`, 'Erro ao fazer push para a branch', distOptions);
    if (currentBranch && (currentBranch != branch)) await this.#execCommand(`git checkout ${currentBranch}`, `Erro ao voltar para a branch ${currentBranch}`);
    this.#msg('title', `Voltado para a branch: ${currentBranch}`);
  }
  
  /////////////////////////////////////////////////////////////////////
  
  async #deployToServer(config, remote, ambiente) {
    try {
      this.#msg('title', `Subindo os arquvios para ${ambiente} via SFTP`);
      await this.#sftp.connect(config);
      this.#sftp.on('upload', info => this.#msg('loading2'));
      await this.#sftp.uploadDir(this.#LOCAL_DIR, remote, {
        filter: (item) => {
          const itemName = this.#path.basename(item);
          return !this.#IGNORE_DIR.includes(itemName);
        }
      });
      this.#msg('sucesso', `Upload para ${ambiente} finalizado sucesso!`);
    } catch (err) {
      this.#msg('erro', `Erro ao subir para ${ambiente} via SFTP`, err.message);
    } finally {
      await this.#sftp.end();
    }
  }
  
  async #dev() {
    this.#msg('title', 'Iniciando deploy para DEV');
    await this.#deployToBranch(this.#GIT_BRANCH_DEV);
    await this.#deployToServer(this.#CONFIG_DEV, this.#REMOTE_DEV, this.#GIT_BRANCH_DEV);
  }
  async #prod() {
    this.#msg('title', 'Iniciando deploy para PROD');
    await this.#deployToBranch(this.#GIT_BRANCH_PROD);
    await this.#deployToServer(this.#CONFIG_PROD, this.#REMOTE_PROD, this.#GIT_BRANCH_PROD);
  }
  async #build() {
    this.#msg('title', 'Buildando o projeto');
    await this.#execCommand('yarn build', 'Erro ao buildar o projeto');
    this.#msg('sucesso', 'Build concluído com sucesso!');
    this.#msg('loading');
  }
  
  
  /////////////////////////////////////////////////////////////////////
  
  async #main() {
    await this.#execCommand('git --version', 'Erro ao verificar a versão do Git');
    await this.#execCommand('git rev-parse --is-inside-work-tree', 'Git ainda não foi iniciado.');
  
    if (this.#argv.dev) await this.#dev();
    else if (this.#argv.prod) await this.#prod();
    else {
      await this.#dev();
      await this.#prod();
    }
  
    this.#msg('sucesso', 'Deploy Finalizado!');
  }
}

module.exports = Service;
module.exports.default = Service;