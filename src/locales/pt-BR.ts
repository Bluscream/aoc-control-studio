// Idioma de origem: o texto aqui é exatamente o texto original da interface.
// As chaves de `backend` precisam continuar idênticas às mensagens do Rust (src-tauri),
// pois são usadas para reconhecer e traduzir essas mensagens (ver src/i18n/backend.ts).
const ptBR = {
  meta: {
    homeTitle: "Modos do monitor — AOC Control Studio",
    homeDescription: "Escolha ou crie modos de imagem para o seu monitor AOC 24G2S.",
    editorTitle: "Editar modo — AOC Control Studio",
    editorDescription: "Ajuste brilho, cor, overdrive, freesync e recursos do monitor AOC 24G2S.",
  },
  language: {
    label: "Idioma",
    "pt-BR": "Português (Brasil)",
    en: "English",
  },
  tray: {
    show: "Abrir AOC Control Studio",
    quit: "Sair",
  },
  titleBar: {
    minimize: "Minimizar",
    restore: "Restaurar",
    maximize: "Maximizar",
    close: "Fechar",
  },
  profiles: {
    custom: { name: "Custom", subtitle: "Ajuste livre · Customizado" },
    fps: { name: "FPS Competitivo", subtitle: "Overdrive forte · Sombras 60" },
    rts: { name: "RTS / MOBA", subtitle: "Cores vivas · Overdrive médio · FreeSync" },
    racing: {
      name: "Corrida / Imersão",
      subtitle: "Game Color 14 · Overdrive forte · FreeSync",
    },
    work: { name: "Trabalho / Leitura", subtitle: "Low Blue Light · Brilho suave" },
    cinema: { name: "Cinema / Vídeo", subtitle: "Gamma 3 · Contraste 60 · Quente" },
    userSubtitle: "{{brightness}}% brilho · {{overdrive}}",
    fallbackName: "Modo",
    numberedName: "Modo {{n}}",
    newName: "Modo Personalizado {{n}}",
    importedName: "Modo Importado",
    defaultFallback: "Padrão",
  },
  home: {
    ddcOffline: "DDC Offline",
    ddcActive: "DDC/CI Ativo",
    monitorFallback: "AOC Monitor",
    backupButtonTitle: "Exportar/Importar perfis e gerenciar configurações",
    backupButton: "Backup & Perfis",
    autoSwitchTitle: "Troca Automática por Aplicativo",
    autoSwitchOn: "Ativo em 2º plano",
    autoSwitchOff: "Desativado",
    autoSwitchDescription:
      "Ao focar em um jogo ou executável vinculado, o monitor troca automaticamente para o perfil correspondente. Na Área de Trabalho, ele retorna para o padrão: <highlight>{{name}}</highlight>.",
    disableAutoSwitch: "Desativar troca automática",
    enableAutoSwitch: "Ativar troca automática",
    modesTitle: "Modos de Imagem",
    modesDescription:
      "Clique no card para ativar, na estrela para torná-lo o padrão do sistema, ou no lápis para vincular executáveis.",
    closeMessage: "Fechar mensagem",
    closeWarning: "Fechar aviso",
    newMode: "Novo modo",
    exportedAll: "Backup completo com todas as configurações exportado com sucesso!",
    exportedProfile: 'Perfil "{{name}}" exportado em JSON com sucesso!',
    exportedCustom: "Perfil Custom exportado em JSON com sucesso!",
    exportError: "Erro ao exportar JSON.",
    importError: "Erro ao importar arquivo JSON.",
    resetDone:
      "Todas as configurações e perfis foram restaurados aos padrões originais de fábrica!",
  },
  backup: {
    title: "Backup e Gerenciamento de Perfis",
    description:
      "Exporte, importe ou restaure as configurações e modos de imagem em arquivos JSON.",
    exportTitle: "Exportar Configurações (JSON)",
    exportDescription:
      "Gere um arquivo JSON com todas as configurações do aplicativo ou selecione apenas um perfil específico.",
    selectPlaceholder: "Selecione um perfil...",
    allOption: "★ Todas as configurações (Backup Completo)",
    customOption: "Custom (Ajuste livre)",
    builtInSuffix: "(Padrão AOC)",
    userSuffix: "(Personalizado)",
    exportButton: "Exportar",
    importTitle: "Importar Arquivo JSON",
    importDescription:
      "Selecione um arquivo .json para restaurar um backup completo ou importar um perfil individual. O sistema detecta o formato automaticamente.",
    importButton: "Selecionar Arquivo JSON (.json)...",
    resetTitle: "Restaurar Configurações de Fábrica",
    resetDescription:
      "Apaga todos os perfis personalizados e desfaz quaisquer edições feitas nos perfis padrão da AOC, retornando o app ao estado de recém-instalado.",
    resetConfirm: "Tem certeza absoluta?",
    cancel: "Cancelar",
    resetYes: "Sim, Limpar Tudo",
    resetLink: "Limpar dados e restaurar padrões",
  },
  storage: {
    noFileSelected: "Nenhum arquivo selecionado",
    invalidJson: "Arquivo JSON inválido ou corrompido.",
    readFailed: "Falha ao ler o arquivo.",
    profileNotFound: "Perfil não encontrado",
    emptyJson: "Arquivo inválido: JSON vazio ou formato incorreto.",
    importedSingleFrom: 'Perfil "{{name}}" importado com sucesso a partir de {{filename}}!',
    importedSingle: 'Perfil "{{name}}" importado com sucesso!',
    importedAll:
      "Backup completo importado com sucesso! ({{count}} perfis/modificações restaurados de {{filename}}).",
    unknownFormat:
      "Estrutura do arquivo JSON não reconhecida como perfil ou backup do AOC Control Studio.",
  },
  modeCard: {
    use: "Usar {{name}}",
    defaultTitle: "Perfil padrão (quando nenhum app vinculado estiver em foco)",
    defaultBadge: "Padrão",
    autoOnTitle: "Troca automática ATIVA para este perfil (clique para desativar)",
    autoOffTitle: "Troca automática DESATIVADA para este perfil (clique para ativar)",
    auto: "Auto",
    paused: "(pausado)",
    setDefaultTitle: "Definir como perfil padrão",
    setDefaultLabel: "Definir como padrão",
    exportTitle: "Exportar este perfil em JSON",
    exportLabel: "Exportar",
    deleteTitle: "Excluir modo",
    deleteLabel: "Excluir",
    editTitle: "Editar configurações e vincular executáveis",
    editLabel: "Editar",
  },
  values: {
    off: "Desligado",
    standard: "Padrão",
    text: "Texto",
    game: "Jogo",
    movie: "Filme",
    sports: "Esportes",
    reading: "Leitura",
    warm: "Quente",
    cool: "Frio",
    user: "UserRGB",
    multimedia: "Multimídia",
    office: "Escritório",
    racing: "Corrida",
    weak: "Fraco",
    medium: "Médio",
    strong: "Forte",
    topRight: "Sup. Direito",
    bottomRight: "Inf. Direito",
    bottomLeft: "Inf. Esquerdo",
    topLeft: "Sup. Esquerdo",
  },
  editor: {
    tabs: {
      image: "Imagem",
      color: "Cor",
      perf: "Desempenho",
      extra: "Recursos",
      apps: "Aplicativos",
    },
    back: "Voltar aos Modos",
    namePlaceholder: "Nome do modo...",
    intro:
      "Ajuste os controles livremente. Os comandos só são enviados ao monitor ao clicar em Salvar.",
    resetTitle: "Restaurar este perfil para as configurações originais de fábrica da AOC",
    resetButton: "Restaurar Padrão",
    resetDone:
      'Valores do perfil "{{name}}" restaurados para o padrão original de fábrica da AOC. Clique em "Salvar no Monitor" para aplicar ao hardware.',
    exportError: "Erro ao exportar perfil.",
    exportTitle: "Escolher onde salvar as configurações deste perfil em arquivo JSON",
    exportButton: "Exportar JSON",
    readTitle: "Carregar os valores que estão ativos agora no monitor",
    reading: "Lendo...",
    readButton: "Ler do Monitor",
    readFailed: "Não foi possível ler os valores atuais do monitor via DDC/CI.",
    applying: "Aplicando...",
    saved: "Salvo e Aplicado!",
    save: "Salvar no Monitor",
    noChanges: "Sem alterações",
    blocked: {
      gameMode: "Bloqueado (Modo de Jogo - {{mode}})",
      hdr: "Bloqueado (HDR - {{mode}})",
      eco: "Bloqueado (Modo ECO - {{mode}})",
      dcr: "Bloqueado (DCR Ativo)",
    },
    lock: {
      gameModeActive: "Modo de Jogo AOC ativo ({{mode}})",
      hdrActive: "Modo HDR ativo ({{mode}})",
      ecoActive: "Modo ECO ativo ({{mode}})",
      imageGameMode:
        'O firmware do monitor AOC assume o controle e bloqueia os ajustes manuais de <strong>Brilho</strong>, <strong>Contraste</strong>, <strong>Gama</strong>, <strong>Modo ECO</strong> e <strong>DCR</strong> enquanto um Modo de Jogo pré-calibrado estiver ativo. Para ajustá-los livremente, defina o Modo de Jogo como <em>"Desligado"</em> na aba <strong>Desempenho</strong>.',
      imageHdr:
        'O perfil HDR em execução calibra dinamicamente a curva de imagem e bloqueia <strong>Contraste</strong>, <strong>Gama</strong> e <strong>Modo ECO</strong>. Para liberar esses controles, defina o Modo HDR como <em>"Off"</em> na aba <strong>Recursos</strong>.',
      imageEco:
        'O perfil de economia de energia ECO ({{mode}}) assume a calibração do monitor e bloqueia os ajustes manuais de <strong>Brilho</strong> e <strong>Contraste</strong>. Para ajustá-los livremente, defina o Modo ECO como <em>"Padrão"</em> abaixo.',
      colorGameMode:
        "O Modo de Jogo AOC calibra e bloqueia o controle manual de Game Color (saturação).",
      colorHdr:
        "O Modo HDR ativo assume a colorimetria do painel e bloqueia a Temperatura de Cor, Game Color e o Filtro de Luz Azul (Low Blue Light).",
      perfHdr:
        "O monitor bloqueia o <strong>Modo de Jogo AOC</strong> e o <strong>Shadow Control</strong> enquanto um perfil HDR estiver em execução. Para usar os Modos de Jogo, desligue o Modo HDR na aba <strong>Recursos</strong>.",
      perfGameMode:
        "Com o Modo de Jogo ativo, o firmware define automaticamente o <strong>Overdrive</strong> e o <strong>Shadow Control</strong> ideais para esse tipo de jogo, bloqueando alterações manuais.",
      extraGameMode:
        'O <strong>Modo HDR</strong> está bloqueado porque ativar o HDR cancela automaticamente o Modo de Jogo no firmware do monitor AOC. Para ativar o HDR, defina o Modo de Jogo como <em>"Desligado"</em> na aba <strong>Desempenho</strong>.',
    },
    image: {
      lightingTitle: "Iluminação & Contraste",
      brightness: "Brilho",
      contrast: "Contraste",
      dcrNote:
        'Nota: No firmware AOC, enquanto o DCR estiver ligado ou o Modo ECO não estiver em "Padrão", o monitor controla o brilho e o contraste automaticamente.',
      processingTitle: "Processamento de Imagem",
      gamma: "Curva de Gamma",
      ecoMode: "Modo ECO",
      dcr: "DCR (Contraste Dinâmico)",
      dcrDescription: "Ajusta o contraste automaticamente com base na cena exibida",
    },
    color: {
      tempTitle: "Temperatura de Cor",
      preset: "Predefinição",
      red: "Vermelho (R)",
      green: "Verde (G)",
      blue: "Azul (B)",
      enhanceTitle: "Realce & Conforto Visual",
      gameColor: "Game Color (Saturação Gamer)",
      gameColorDescription:
        "Escala real do hardware AOC (0 = P&B, 10 = Padrão, 20 = Saturação máxima)",
      lowBlue: "Low Blue Light (Filtro de Luz Azul)",
    },
    perf: {
      gamingTitle: "Otimização para Jogos",
      gameMode: "Modo de Jogo AOC",
      overdrive: "Overdrive",
      shadowControl: "Shadow Control",
      shadowDescription: "Ajusta áreas escuras em passos de 10 (50 = Neutro)",
      syncTitle: "Sincronização Gamer",
      adaptiveSync: "AMD FreeSync / Taxa Variável (VRR)",
      adaptiveSyncOsdHint:
        "Deixe 'Adaptive-Sync' ligado uma única vez nos botões físicos do monitor (Config. Jogo → Adaptive-Sync) para liberar o controle via software.",
      adaptiveSyncDescription:
        "Ativa o AMD FreeSync no driver Radeon e a Taxa de Atualização Variável (VRR) nas configurações de tela do sistema para eliminar tearing",
      badgeSupported: "FreeSync + VRR",
      badgeOsd: "Requer OSD Ativo",
      badgeVrr: "VRR",
      linuxTitle: "💡 Informação sobre o Linux:",
      linuxVrr:
        "No Linux o VRR é controlado pelo compositor (COSMIC via <mono>cosmic-randr</mono>, KDE via <mono>kscreen-doctor</mono>). Confira o estado em Configurações → Telas.",
      linuxOsd:
        'Se aparecer "Requer OSD Ativo", ligue <em>Adaptive-Sync</em> nos botões físicos do monitor e verifique se o driver <code>amdgpu</code> anuncia suporte para a saída.',
      windowsTitle: "💡 Informação sobre o Windows 11:",
      windowsVrr:
        'A linha <mono>"Taxa de atualização variável: Com suporte (48 Hz - 165 Hz)"</mono> no Windows confirma que o FreeSync está 100% ativo.',
      windowsDrr:
        'A opção <em>"Taxa de atualização dinâmica"</em> exibida nas configurações do Windows é o DRR (exclusivo para economia de bateria de laptops) e não se aplica a placas de vídeo desktop como a RX 6600.',
    },
    extra: {
      osdTitle: "Assistência em Tela",
      dialPoint: "Dial Point (Mira na Tela)",
      dialPointDescription: "Exibe a mira nativa de hardware do monitor no centro da tela",
      crosshairBadge: "Crosshair",
      frameCounter: "Contador de Quadros (Frame Counter)",
      hdrTitle: "Perfis HDR (HDR Mode)",
      hdrMode: "Modo HDR do Monitor",
      hdrDescription:
        "O AOC 24G2S conta com perfis avançados integrados no firmware (Off, HDR Picture, HDR Movie e HDR Game) que expandem dinamicamente o contraste e saturação de cores sem distorcer o sinal SDR.",
    },
    apps: {
      defaultTitle: "Padrão do Sistema Operacional",
      setDefault: "Definir como Perfil Padrão do Sistema",
      currentDefault: "Padrão Atual",
      defaultDescription:
        "Quando você fechar os jogos vinculados ou simplesmente estiver navegando na Área de Trabalho, o monitor aplicará automaticamente este perfil.",
      defaultActive: "Padrão Ativo",
      makeDefault: "Tornar Padrão",
      linkedTitle: "Jogos e Executáveis Vinculados",
      linkedDescription:
        "Sempre que qualquer um dos executáveis abaixo entrar em primeiro plano, o monitor alternará para este perfil automaticamente.",
      noExes:
        "Nenhum executável vinculado a este perfil. Digite o nome do executável abaixo ou escolha entre os aplicativos atualmente abertos no sistema.",
      removeExe: "Remover {{exe}}",
      exePlaceholder: "Ex: cs2.exe, valorant.exe, firefox, steam...",
      add: "Adicionar",
      runningTitle: "Detectar janelas e jogos abertos agora",
      runningButton: "Apps Abertos Agora",
      detectedTitle: "Aplicativos e Jogos detectados",
      filterPlaceholder: "Filtrar aplicativos abertos...",
      detecting: "Detectando janelas ativas...",
      noMatch: "Nenhum aplicativo encontrado com este filtro.",
      linked: "Vinculado",
      link: "+ Vincular",
    },
    pending: {
      title: "Alterações pendentes",
      description: "Clique para enviar as configurações para o monitor.",
      discard: "Descartar",
      sending: "Enviando...",
      saveApply: "Salvar e Aplicar",
    },
  },
  backend: {
    fields: {
      gameMode: "Modo de Jogo",
      ecoMode: "Modo ECO",
      brightness: "Brilho",
      contrast: "Contraste",
      colorTemp: "Temperatura de Cor",
      dialPoint: "Mira na Tela",
    },
    messages: {
      ddcUnavailable: "Monitor DDC/CI não acessível",
      adaptiveSyncOsd:
        "Ative 'Adaptive-Sync' uma única vez nos botões físicos do monitor (Config. Jogo → Adaptive-Sync) para alternar FreeSync pelo app.",
      permissionDenied:
        "Sem permissão para acessar {{devices}} — execute 'sudo ./scripts/setup-linux.sh' e faça logout/login",
      noI2c: "Nenhum /dev/i2c-* encontrado — carregue o módulo com 'sudo modprobe i2c-dev'",
      noMonitor:
        "Nenhum monitor DDC/CI respondeu nos barramentos /dev/i2c-* (verifique se DDC/CI está ligado no OSD do monitor)",
      busNotOpen: "Barramento I2C não aberto",
      invalidHeader: "Cabeçalho DDC/CI inválido",
      invalidChecksum: "Checksum DDC/CI inválido",
      busy: "Monitor ocupado (len={{len}})",
      vcpUnsupported: "VCP 0x{{code}} não suportado",
      tpvUnavailable: "TPV F8 E1 {{code}} indisponível",
      hdrCompositor: "HDR do sistema deve ser ativado nas configurações de tela do compositor",
      hdrUnsupported: "HDR não é suportado nesta saída de vídeo",
      tpvNeedsAdl: "TPV Extended DDC/CI requer acesso I2C direto da GPU (ADL)",
      noWindowsMonitor: "Nenhum monitor encontrado no Windows",
      adlxMissing: "Driver AMD ADLX (amdadlx64.dll) não encontrado",
      vrrOutputNotFound: "FreeSync: saída não encontrada no cosmic-randr",
      vrrModeNotFound: "FreeSync: modo atual não encontrado",
      vrrInvalidResolution: "FreeSync: resolução inválida",
      vrrCosmicRefused:
        "FreeSync: o COSMIC recusou a alteração de Adaptive-Sync (verifique se o monitor anuncia suporte)",
      vrrKscreenFailed: "FreeSync: falha ao aplicar via kscreen-doctor",
      vrrUnsupported:
        "FreeSync: controle de VRR não suportado neste ambiente gráfico (ajuste nas configurações de tela do sistema)",
    },
  },
};

type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };

/** Formato que todo idioma precisa seguir (mesmas chaves do pt-BR). */
export type LocaleResource = DeepStrings<typeof ptBR>;

export default ptBR;
