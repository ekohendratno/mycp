const dashboardSites = document.querySelector('#dashboardSites');
dashboardSites.textContent = getSites().length;

const cliModal = document.querySelector('#cliModal');
const cliOutput = document.querySelector('#cliOutput');
const cliCommand = document.querySelector('#cliCommand');
const commandResponses = {
  'mycp status': 'nginx          running\nphp-fpm        running\nmysql          running\npostgresql     running',
  'mycp sites:list': getSites().map((site) => `${site.domain.padEnd(28)} ${site.username}`).join('\n'),
  'mycp services': 'nginx running\nphp8.3-fpm running\nmysql running\npostgresql running\ncloudflared running',
  'clear': ''
};

function openCli() {
  cliModal.classList.add('open');
  cliModal.setAttribute('aria-hidden', 'false');
  cliCommand.focus();
}

function closeCli() {
  cliModal.classList.remove('open');
  cliModal.setAttribute('aria-hidden', 'true');
  cliCommand.value = '';
}

document.querySelector('#openCli').addEventListener('click', openCli);
document.querySelector('#closeCli').addEventListener('click', closeCli);

cliModal.addEventListener('click', (event) => {
  if (event.target === cliModal) closeCli();
});

function runCliCommand() {
  const command = cliCommand.value.trim();
  if (!command) return;

  if (command === 'clear') {
    cliOutput.textContent = 'mycp@server:~$ _';
    cliCommand.value = '';
    return;
  }

  const response = commandResponses[command] || `command not found: ${command}`;
  cliOutput.textContent = cliOutput.textContent.replace(/\n?mycp@server:~\$ _$/, '');
  cliOutput.textContent += `\nmycp@server:~$ ${command}\n${response}\n\nmycp@server:~$ _`;
  cliOutput.scrollTop = cliOutput.scrollHeight;
  cliCommand.value = '';
}

document.querySelector('#cliForm').addEventListener('submit', (event) => {
  event.preventDefault();
  runCliCommand();
});

cliCommand.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    runCliCommand();
  }
});
