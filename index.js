#!/usr/bin/env node

const args = process.argv.slice(2)

if (args.includes('-v') || args.includes('--version')) {
  const path = require('path')
  const pkg = require(path.join(__dirname, 'package.json'))
  console.log(pkg.version)
  process.exit(0)
}

if (args.includes('-h') || args.includes('--help')) {
  console.log(`
    Uso: deploy-sftp [opções] ou deploy [opções]

    Opções:
      -g, --git     Executa apenas o fluxo Git (inclui build)
      -s, --sftp    Executa apenas o upload SFTP (inclui build)
      -v, --version Exibe a versão
      -h, --help    Exibe esta ajuda
  `)
  process.exit(0)
}

/**
 * Script de deploy para projetos Vue.js
 * 
 * Instalar Dependencias: yarn add dotenv ssh2-sftp-client inquirer ora --dev
 * Adicionar `"deploy": "node deploy.js"` ao package.json na seção de "scripts"
 * 
 * Comandos:
 *  - yarn deploy
 *
 * Script unificado de deploy:
 *  - Seleção de ambiente (todos/dev/prod) via menu (inquirer)
 *  - Build do projeto (yarn build)
 *  - Git flow: clone em temp, selecionar tag, commit, tag, push
 *  - Upload via SFTP inspirado em deploy.sh, seleção de ambiente mantém variáveis .env
 */
(async function () {
  const fs = require('fs')
  const os = require('os')
  const path = require('path')
  const { exec, execSync } = require('child_process')
  const Client = require('ssh2-sftp-client')
  const { Client: SSHClient } = require('ssh2')
  const inquirer = require('inquirer')
  const { default: ora } = await import('ora')
  const dotenv = require('dotenv')

  try {
    require.resolve('dotenv');
    require.resolve('ssh2-sftp-client');
    require.resolve('inquirer');
    require.resolve('ora');
  } catch (err) {
    console.error('Erro: Certifique-se de que as dependências necessárias estão instaladas.');
    console.error('Execute: yarn add dotenv ssh2-sftp-client inquirer ora --dev');
    process.exit(1);
  }

  const projectRoot = process.cwd()
  const envPath = path.join(projectRoot, '.env')

  if (!fs.existsSync(envPath)) {
    console.error(`Erro: O arquivo .env não foi encontrado no caminho: ${envPath}`)
    process.exit(1)
  }

  dotenv.config({ path: envPath })

  // Variáveis de ambiente obrigatórias
  const varEnvObrigatorias = [
    'VITE_REPO_URL',
    'VITE_GIT_EMAIL',
    'VITE_GIT_USER',
    
    'VITE_BUILD_FOLDER',

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

  new Service({
    fs,
    os,
    ora,
    path,
    projectRoot,
    sftp: new Client(),
    ssh: new SSHClient(),
    exec,
    execSync,
    inquirer
  });
})();

class Service {
  #fs;
  #os;
  #ora;
  #path;
  #sftp;
  #exec;
  #execSync;
  #inquirer;
  #projectRoot;

  #REPO_URL;
  #DIST_FOLDER;
  #LOCAL_DIR;
  #GIT_EMAIL;
  #GIT_NAME;
  #CLONE_URL;
  #CONFIG;

  #RED;
  #GREEN;
  #LIGHT_GREEN;
  #YELLOW;
  #BLUE;
  #LIGHT_BLUE;
  #GRAY;
  #WHITE;
  #NC;

  constructor({
    fs,
    os,
    ora,
    path,
    projectRoot,
    sftp,
    exec,
    execSync,
    inquirer,
  }) {
    this.#fs = fs;
    this.#os = os;
    this.#ora = ora;
    this.#path = path;
    this.#sftp = sftp;
    this.#exec = exec;
    this.#execSync = execSync;
    this.#inquirer = inquirer;
    this.#projectRoot = projectRoot;

    /////////////////////////////////////

    this.#REPO_URL = process.env.VITE_REPO_URL;
    this.#DIST_FOLDER = process.env.VITE_BUILD_FOLDER;
    this.#LOCAL_DIR    = this.#path.join(this.#projectRoot, this.#DIST_FOLDER);
    this.#GIT_EMAIL = process.env.VITE_GIT_EMAIL;
    this.#GIT_NAME = process.env.VITE_GIT_USER;

    this.#CLONE_URL = this.#REPO_URL.match(/^https?:\/\/bitbucket\.org\//)
      ? this.#REPO_URL.replace(/^https?:\/\/bitbucket\.org\//, 'git@bitbucket.org:')
      : this.#REPO_URL;

    this.#CONFIG = {
      dev: {
        branch: 'dev',
        sftp: {
          host: process.env.VITE_FTP_HOST_DEV,
          port: process.env.VITE_FTP_PORT_DEV || 22,
          username: process.env.VITE_FTP_USER_DEV,
          password: process.env.VITE_FTP_PASS_DEV,
        },
        remoteDir: process.env.VITE_FTP_DIRR_DEV
      },
      prod: {
        branch: 'prod',
        sftp: {
          host: process.env.VITE_FTP_HOST_PROD,
          port: process.env.VITE_FTP_PORT_PROD || 22,
          username: process.env.VITE_FTP_USER_PROD,
          password: process.env.VITE_FTP_PASS_PROD,
        },
        remoteDir: process.env.VITE_FTP_DIRR_PROD
      }
    };

    this.#RED = '\x1b[0;31m';
    this.#GREEN = '\x1b[0;32m';
    this.#LIGHT_GREEN = '\x1b[1;32m';
    this.#YELLOW = '\x1b[0;33m';
    this.#BLUE = '\x1b[0;34m';
    this.#LIGHT_BLUE = '\x1b[1;36m';
    this.#GRAY = '\x1b[0;90m';
    this.#WHITE = '\x1b[1;37m';
    this.#NC = '\x1b[0m';

    this.main()
  }

  log(msg, icone = '●', color = this.#BLUE, dotsColor = this.#GRAY) {
    const dots = dotsColor ? `${dotsColor}...${this.#NC}` : '';
    const point = color ? `${color}●${this.#NC} ` : '';
    const icon = icone ? `${icone} ` : '';
    console.log(`${point}${icon}${point}${msg}${dots}`);
  }
  logDot() {
    process.stdout.write(`${this.#LIGHT_GREEN}●${this.#NC}`);
  }

  run(cmd, opts = {}) {
    return new Promise((resolve, reject) => {
      this.#exec(cmd, { shell: true, ...opts, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) return reject(stderr || err)
        resolve(stdout);
      });
    });
  }

  async withSpinner(title, fn) {
    const spinner = this.#ora({ text: title, color: 'cyan' }).start();
    try {
      const result = fn();
      if (result instanceof Promise) await result;
      spinner.succeed(`${title}`);
      return result;
    } catch (e) {
      spinner.fail(`${title}`);
      throw e;
    }
  }

  async selectEnv() {
    const { env } = await this.#inquirer.prompt([{
      type: 'list',
      name: 'env',
      message: 'Selecione o ambiente para deploy:',
      choices: ['todos', 'dev', 'prod']
    }]);
    return env;
  }

  async selectTag(tmpDir, envKey) {
    this.log(`Buscando tags do repositório para ${this.#YELLOW}${envKey}${this.#NC}`, '🔍', this.#BLUE);
    this.run(`git remote set-url origin ${this.#CLONE_URL}`, { cwd: tmpDir });
    this.run('git fetch --tags', { cwd: tmpDir });
    
    const allTags = this.#execSync('git tag', { cwd: tmpDir }).toString().trim().split(/\r?\n/).filter(Boolean);
    
    const envSuffix = `.${envKey}`;
    const envTags = allTags
      .filter(tag => tag.endsWith(envSuffix))
      .map(tag => ({
        display: tag.replace(envSuffix, ''), // Formato de exibição n.n
        full: tag // Formato completo n.n.dev/prod
      }));
    
    const lastFive = envTags.slice(-5);
    
    let defaultTag = '1.0';
    if (envTags.length) {
      const lastTag = envTags[envTags.length - 1].display;
      const [m, s] = lastTag.split('.').map(n => parseInt(n, 10));
      defaultTag = `${m}.${isNaN(s) ? 1 : s + 1}`;
    }
    
    const choices = [
      { name: defaultTag, value: defaultTag },
      { name: `nova-tag-personalizada`, value: 'nova-tag-personalizada' },
      { name: `${this.#RED}cancelar${this.#NC}`, value: 'cancelar' },
      new this.#inquirer.Separator(`${this.#GRAY}----- Últimas tags -----${this.#NC}`),
      ...lastFive.map(tag => ({ 
        name: tag.display, 
        value: tag.display 
      })),
      new this.#inquirer.Separator(`${this.#GRAY}------------------------${this.#NC}`),
    ];

    const { tag } = await this.#inquirer.prompt([{
      type: 'list',
      name: 'tag',
      message: `●●●● Selecione a tag para ${this.#YELLOW}${envKey}${this.#NC}:`,
      choices
    }]);
    
    if (tag === 'cancelar') {
      this.log(`${this.#RED}✖ ${this.#NC}●●●● ${this.#RED}Deploy cancelado pelo usuário${this.#NC}`, false, false, false);
      await this.removeTempDir(tmpDir);
      process.exit(0);
    }
    
    if (tag === 'nova-tag-personalizada') {
      const { custom } = await this.#inquirer.prompt([{
        type: 'input',
        name: 'custom',
        message: `Digite a nova tag (formato n.n), recomendada ${defaultTag}:`,
        validate: i => /^\d+\.\d+$/.test(i) ? true : 'Formato inválido'
      }]);
      return { display: custom, full: `${custom}${envSuffix}` };
    }
    
    return { display: tag, full: `${tag}${envSuffix}` };
  }

  async removeTempDir(tmpDir) {
    await this.withSpinner(`🧹 ${this.#GREEN}●${this.#NC} Removendo diretório temporário`, async () => {
      await new Promise(r => setTimeout(r, 100));
      this.#fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  }

  async gitFlow(envKey) {
    const { branch } = this.#CONFIG[envKey];
    const tmp = this.#fs.mkdtempSync(this.#path.join(this.#os.tmpdir(), `deploy-${branch}-`));
    try {
      try {
        await this.withSpinner(
          `📥 ${this.#BLUE}●${this.#NC} Clonando branch ${this.#YELLOW}${branch}${this.#NC}`, 
          () => this.run(`git clone --branch ${branch} ${this.#CLONE_URL} ${tmp}`)
        );
      } catch (error) {
        await this.withSpinner(
          `📥 ${this.#RED}●${this.#NC} Branch não encontrada, clonando repositório`, 
          () => this.run(`git clone ${this.#CLONE_URL} ${tmp}`)
        );
        
        await this.withSpinner(
          `🔄 ${this.#YELLOW}●${this.#NC} Criando nova branch ${this.#YELLOW}${branch}${this.#NC}`, 
          async () => {
            await this.run(`git checkout --orphan ${branch}`, { cwd: tmp });
            await this.run('git rm -rf .', { cwd: tmp });
            await this.run(`git config --add branch.${branch}.remote origin`, { cwd: tmp });
            await this.run(`git config --add branch.${branch}.merge refs/heads/${branch}`, { cwd: tmp });
          }
        );
      }

      await this.withSpinner(`🧹 ${this.#YELLOW}●${this.#NC} Removendo arquivos exceto .git`, () => {
        this.#fs.readdirSync(tmp).forEach(item => {
          if (item !== '.git') this.#fs.rmSync(this.#path.join(tmp, item), { recursive: true, force: true });
        });
      });

      await this.withSpinner(`📋 ${this.#BLUE}●${this.#NC} Copiando build para o diretório temporário`, () =>
        this.#fs.cpSync(this.#LOCAL_DIR, tmp, { recursive: true })
      );

      await this.withSpinner(`🔧 ${this.#BLUE}●${this.#NC} Configurando identidade Git`, () => {
        this.run(`git config user.email "${this.#GIT_EMAIL}"`, { cwd: tmp });
        this.run(`git config user.name "${this.#GIT_NAME}"`, { cwd: tmp });
      });

      const tagInfo = await this.selectTag(tmp, envKey);
    
      await this.withSpinner(
        `🗑️  ${this.#YELLOW}●${this.#NC} Excluindo tag anterior ${this.#LIGHT_BLUE}${tagInfo.display}${this.#NC}`, 
        async () => {
          try {
            await this.run(`git rev-parse -q --verify refs/tags/${tagInfo.full}`, { cwd: tmp });
            await this.run(`git tag -d ${tagInfo.full}`, { cwd: tmp });
            await this.run(`git push origin :refs/tags/${tagInfo.full}`, { cwd: tmp });
          } catch {}
      });

      await this.withSpinner(
        `📝 ${this.#BLUE}●${this.#NC} Criando commit para a versão ${this.#LIGHT_BLUE}${tagInfo.display}${this.#NC}`, 
        async () => {
          const lockFile = this.#path.join(tmp, '.git', 'index.lock');
          if (this.#fs.existsSync(lockFile)) this.#fs.unlinkSync(lockFile);
          await this.run('git add .', { cwd: tmp });
          await this.run(`git commit --allow-empty -m "Atualizando para a versão ${tagInfo.display}"`, { cwd: tmp });
          await this.run(`git tag ${tagInfo.full}`, { cwd: tmp });
      });

      await this.withSpinner(
        `🚀 ${this.#BLUE}●${this.#NC} Enviando branch ${this.#YELLOW}${branch}${this.#NC}`, () =>
        this.run(`git push origin ${branch} --force`, { cwd: tmp })
      );

      await this.withSpinner(
        `🚀 ${this.#BLUE}●${this.#NC} Enviando tag ${this.#LIGHT_BLUE}${tagInfo.display}${this.#NC}`, () =>
        this.run(`git push origin ${tagInfo.full} --force`, { cwd: tmp })
      );
    } finally {
      await this.removeTempDir(tmp)
    }
  }

  async sftpUpload(envKey) {
    const cfg = this.#CONFIG[envKey].sftp;
    const remote = this.#CONFIG[envKey].remoteDir;
    try {
      await this.withSpinner(`🔧 ${this.#BLUE}●${this.#NC} Conectando SFTP em ${this.#YELLOW}${envKey}${this.#NC}`, () => this.#sftp.connect(cfg));
      this.#sftp.on('upload', () => this.logDot());
      this.log(`Upload de arquivos para ${this.#YELLOW}${envKey}${this.#NC}`, '🚀', this.#BLUE);
      await this.#sftp.uploadDir(this.#LOCAL_DIR, remote, {
        filter: item => !['1BKP','serve','server','painel','.git'].includes(this.#path.basename(item))
      });
      this.log(`\n${this.#GREEN}✔${this.#NC} ●●●● ${this.#GREEN}Upload ${this.#YELLOW}${envKey}${this.#GREEN} concluído${this.#NC}`, false, false, false);
    } finally {
      await this.#sftp.end();
    }
  }
  
  async main() {
    const args = process.argv.slice(2)
    const mode = (args.includes('-s') || args.includes('--sftp')) 
      ? 'sftp'
      : (args.includes('-g') || args.includes('--git'))  ? 'git' : 'full';

    await this.withSpinner(
      `📥 ${this.#BLUE}●${this.#NC} Buildando o projeto`, 
      () => this.run('yarn build', { cwd: this.#projectRoot })
    );

    const env = await this.selectEnv();
    const targets = env === 'todos' ? ['dev', 'prod'] : [env];

    for (const t of targets) {
      this.log(`\n${this.#LIGHT_BLUE}→ AMBIENTE: ${this.#YELLOW}${t.toUpperCase()}${this.#NC}`, false, false, false);
      if (mode !== 'sftp') await this.gitFlow(t);
      if (mode !== 'git') await this.sftpUpload(t);
    }

    this.log(`\n${this.#LIGHT_GREEN}●●●●●●●●●● Deploy finalizado! ●●●●●●●●●●${this.#NC}`, false, false, false);
  }
}

module.exports = Service;
module.exports.default = Service;