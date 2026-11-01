# 🖥️ AOC Control Studio

<p align="center">
  <strong>Software moderno, leve e ultrarrápido para controle nativo de hardware, modos de imagem e automação para monitores gamers AOC (como o AOC 24G2S).</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-blue?logo=tauri&logoColor=white" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/Rust-Edition%202024-orange?logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Platform-Windows-0078D6?logo=windows&logoColor=white" alt="Windows" />
</p>

---

## 📖 Visão Geral

O **AOC Control Studio** nasceu da necessidade de substituir softwares pesados e instáveis de fabricantes por uma solução moderna, nativa e de baixo consumo de recursos. Utilizando comunicação direta via **DDC/CI** (protocolo I2C da placa de vídeo para o monitor) e APIs gráficas do Windows, o software envia comandos diretamente ao microcontrolador do monitor sem exigir cliques nos botões físicos do aparelho.

Além do controle manual de imagem, o projeto traz um **sistema inteligente de automação de perfis por aplicativo (.exe)**: ao entrar em um jogo, o monitor muda instantaneamente suas configurações de imagem e tempo de resposta; ao retornar à Área de Trabalho, volta sozinho para o perfil padrão do Windows.

---

## ✨ Recursos Principais

### 🎮 Modos de Imagem Pré-configurados e Customizados
- **FPS Competitivo:** Máxima visibilidade com Overdrive forte, Shadow Control calibrado e Mira no centro da tela.
- **RTS / MOBA:** Cores realçadas (Game Color), tempo de resposta balanceado e FreeSync ativo.
- **Corrida / Imersão:** Saturação de cores vívida e alta fluidez sem tearing.
- **Trabalho / Leitura:** Redução do brilho e filtro de luz azul (Low Blue Light) para prevenir fadiga ocular.
- **Cinema / Vídeo:** Gamma 3 e temperatura de cor quente com contraste dinâmico.
- **Modos Customizados Ilimitados:** Crie, edite e nomeie perfis livremente conforme a sua preferência.

### ⚡ Automação Inteligente por Executável (.exe)
- **Troca Automática em Tempo Real:** Detecta a janela em primeiro plano e aplica o perfil correto em milissegundos.
- **Retorno ao Perfil Padrão do Windows:** Escolha qual perfil você quer na Área de Trabalho e o app restaura ele assim que fechar os jogos.
- **Toggle Individual por Perfil:** Ative ou pause a troca automática de cada perfil diretamente pelo card na tela inicial, sem precisar remover os executáveis cadastrados.
- **Detecção com Suporte a Jogos em Modo Administrador:** Inspeção profunda via snapshot de kernel (`Toolhelp32Snapshot`) e ativação automática de privilégios (`SeDebugPrivilege`), garantindo que até jogos rodando como Administrador ou com anti-cheats (Vanguard, BattlEye, EAC) sejam detectados.

### 🛡️ Proteções e Travas de Hardware Fiéis ao Firmware AOC
O monitor possui regras internas que cancelam modos caso comandos conflitantes sejam enviados. O AOC Control Studio respeita e avisa sobre todas elas:
- **Modo de Jogo AOC:** Ao ativar FPS, RTS, Corrida ou Gamer 1..3, o firmware bloqueia Brilho, Contraste, Gamma, Modo ECO, DCR, Shadow Control, Overdrive, Game Color e Modo HDR.
- **Modo HDR:** Perfis HDR integrados assumem a calibração do painel, travando Gamma, Modo ECO, Contraste, Modo de Jogo AOC, Shadow Control, Game Color e Low Blue Light.
- **Modo ECO:** Perfis de economia travam os ajustes de Brilho e Contraste.

### 🪟 Interface Nativa Moderna
- **Barra de Título Customizada:** Visual limpo e semântico com arrasto suave nativo do sistema operacional.
- **Integração com a Bandeja do Sistema (Tray):** O ícone permanece sempre ativo ao lado do relógio do Windows. Clicar no `X` da janela oculta o aplicativo na bandeja, mantendo a automação ativa em segundo plano sem poluir a barra de tarefas.
- **Scrollbar Moderna:** Design discreto e minimalista integrado ao tema escuro.

---

## 🛠️ Tecnologias Utilizadas

- **Core & Backend:** [Rust](https://www.rust-lang.org/) com [Tauri v2](https://v2.tauri.app/) (System Tray, ACL e IPC de alta performance).
- **Frontend:** [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [TanStack Router](https://tanstack.com/router), [Tailwind CSS v4](https://tailwindcss.com/) e [Lucide Icons](https://lucide.dev/).
- **Comunicação de Hardware:** Win32 API (`dxva2.dll`, `user32.dll`, `kernel32.dll`, `advapi32.dll`) e I2C DDC/CI VCP.

---

## 📦 Como Compilar e Empacotar

### Pré-requisitos
1. [Node.js](https://nodejs.org/) (versão 20+ recomendada) ou [pnpm](https://pnpm.io/)
2. [Rust](https://www.rust-lang.org/tools/install) (toolchain GNU `x86_64-pc-windows-gnu` ou MSVC `x86_64-pc-windows-msvc`)
3. MinGW-w64 (caso utilize o target GNU)

```bash
# 1. Clone o repositório
git clone https://github.com/SEU_USUARIO/AOC-Menu-Corrigido.git
cd "AOC-Menu-Corrigido/aoc-control-studio"

# 2. Instale as dependências do frontend
pnpm install
```

### 1️⃣ Executar em Modo de Desenvolvimento
```bash
pnpm tauri dev
```

### 2️⃣ Gerar Versão Portátil (Standalone / Sem Instalação)
Para compilar apenas o binário `.exe` otimizado:
```bash
# Compilar os assets web
pnpm build

# Compilar o binário release com Cargo
cargo build --release --bin app
```
O executável será gerado em:
`target/release/app.exe` (renomeie para `AOC-Control-Studio.exe` e utilize acompanhado de `WebView2Loader.dll`).

### 3️⃣ Gerar o Instalador com Instalação (.exe Setup via NSIS)
Gera o instalador padrão do Windows com assistente de instalação, criação de atalhos no Menu Iniciar/Desktop e desinstalador no Painel de Controle:
```bash
pnpm tauri build --bundles nsis
```
O instalador será gerado em:
`src-tauri/target/release/bundle/nsis/AOC Control Studio_1.0.0_x64-setup.exe`

### 4️⃣ Gerar Pacote Corporativo Windows Installer (.msi)
Gera o arquivo MSI para implantação automatizada ou corporativa:
```bash
pnpm tauri build --bundles msi
```
O pacote será gerado em:
`src-tauri/target/release/bundle/msi/AOC Control Studio_1.0.0_x64_en-US.msi`

### 5️⃣ Gerar Todos os Pacotes de Distribuição de uma só vez
```bash
pnpm tauri build
```

---

## 💡 Modo Verbose (Depuração)

Para executar o software visualizando logs detalhados de DDC/CI, troca de processos e chamadas de hardware:
```powershell
.\AOC-Control-Studio.exe -v
```
*(Também é gerado automaticamente o arquivo `aoc_debug.log` no diretório de execução).*

---

## 🤝 Créditos e Agradecimentos

- **[reverse-engineer-anything (REA)](https://github.com/morluto/rea):** Agradecimento especial às ferramentas e metodologias de engenharia reversa do REA, fundamentais para a análise e recuperação dos opcodes proprietários de hardware (tabelas TPV VCP `0xF8 / 0xE1`, opcodes de saturação `Game Color`, controle de sombras `Shadow Control`, curvas de `Gamma` e perfis de `HDR Mode` do microcontrolador AOC).
- **Comunidade Tauri & Rust:** Pela excelente infraestrutura desktop multiplataforma e de baixo consumo de memória.

---

## 📄 Licença

Distribuído sob a licença MIT. Consulte `LICENSE` para mais informações.
