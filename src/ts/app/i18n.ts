/* =========================================================================
    SpimHub - A MIPS / RISC-V Assembly IDE for Web Browsers

    Path: src/ts/app/i18n.ts

    Languages: English (source), Español, Português, Italiano, Français.

    The interface is written in English. This file translates it:

        T('key', { n: 3 })    strings built in the code (placeholders {n})
        I18N.tr(text)         any English text (dictionary + patterns)

    and a MutationObserver translates the page itself: text nodes and the
    placeholder / title attributes, including everything rendered later
    (menus, runner, pipeline, toasts, console...). "[new file]" is
    translated as "[" + "new file" + "]". Code, program output, registers
    and memory are never touched (SKIP).

    Add a language: one more column in DICT / PATTERNS and in LANGS.

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

type Lang = 'en' | 'es' | 'pt' | 'it' | 'fr';
type Row = [string, string, string, string];        // es, pt, it, fr

const LANGS: Record<Lang, string> = { en: 'English', es: 'Español', pt: 'Português', it: 'Italiano', fr: 'Français' };
const COLUMN: Record<Exclude<Lang, 'en'>, number> = { es: 0, pt: 1, it: 2, fr: 3 };

// ================== //
//  Dictionary        //
// ================== //
//  english                                 español                     português                   italiano                    français
const DICT: Record<string, Row> = {
    // ---- Menus ----
    'file':                                 ['archivo', 'arquivo', 'file', 'fichier'],
    'edit':                                 ['editar', 'editar', 'modifica', 'édition'],
    'view':                                 ['ver', 'ver', 'visualizza', 'affichage'],
    'terminal':                             ['terminal', 'terminal', 'terminale', 'terminal'],
    'help':                                 ['ayuda', 'ajuda', 'aiuto', 'aide'],
    'files':                                ['archivos', 'arquivos', 'file', 'fichiers'],
    'search':                               ['buscar', 'pesquisar', 'cerca', 'rechercher'],
    'extensions':                           ['extensiones', 'extensões', 'estensioni', 'extensions'],
    'settings':                             ['ajustes', 'configurações', 'impostazioni', 'paramètres'],
    'github':                               ['github', 'github', 'github', 'github'],
    'privacy':                              ['privacidad', 'privacidade', 'privacy', 'confidentialité'],
    'license':                              ['licencia', 'licença', 'licenza', 'licence'],
    'profile':                              ['perfil', 'perfil', 'profilo', 'profil'],
    'version':                              ['versión', 'versão', 'versione', 'version'],
    'built':                                ['compilación', 'compilação', 'build', 'build'],
    'author':                               ['autor', 'autor', 'autore', 'auteur'],
    'new file':                             ['nuevo archivo', 'novo arquivo', 'nuovo file', 'nouveau fichier'],
    'new folder':                           ['nueva carpeta', 'nova pasta', 'nuova cartella', 'nouveau dossier'],
    'new window':                           ['nueva ventana', 'nova janela', 'nuova finestra', 'nouvelle fenêtre'],
    'remove window':                        ['quitar ventana', 'remover janela', 'rimuovi finestra', 'fermer la fenêtre'],
    'open file':                            ['abrir archivo', 'abrir arquivo', 'apri file', 'ouvrir un fichier'],
    'open folder':                          ['abrir carpeta', 'abrir pasta', 'apri cartella', 'ouvrir un dossier'],
    'save':                                 ['guardar', 'salvar', 'salva', 'enregistrer'],
    'Save':                                 ['Guardar', 'Salvar', 'Salva', 'Enregistrer'],
    'save all':                             ['guardar todo', 'salvar tudo', 'salva tutto', 'tout enregistrer'],
    'close all':                            ['cerrar todo', 'fechar tudo', 'chiudi tutto', 'tout fermer'],
    'save project':                         ['guardar proyecto', 'salvar projeto', 'salva progetto', 'enregistrer le projet'],
    'new project':                          ['nuevo proyecto', 'novo projeto', 'nuovo progetto', 'nouveau projet'],
    'open project':                         ['abrir proyecto', 'abrir projeto', 'apri progetto', 'ouvrir un projet'],
    'undo':                                 ['deshacer', 'desfazer', 'annulla', 'annuler'],
    'redo':                                 ['rehacer', 'refazer', 'ripeti', 'rétablir'],
    'cut':                                  ['cortar', 'recortar', 'taglia', 'couper'],
    'copy':                                 ['copiar', 'copiar', 'copia', 'copier'],
    'paste':                                ['pegar', 'colar', 'incolla', 'coller'],
    'find':                                 ['buscar', 'localizar', 'trova', 'rechercher'],
    'replace':                              ['reemplazar', 'substituir', 'sostituisci', 'remplacer'],
    'replace all':                          ['reemplazar todo', 'substituir tudo', 'sostituisci tutto', 'tout remplacer'],
    'all':                                  ['todo', 'tudo', 'tutto', 'tout'],
    'search in files':                      ['buscar en archivos', 'pesquisar nos arquivos', 'cerca nei file', 'rechercher dans les fichiers'],
    'go to line':                           ['ir a la línea', 'ir para a linha', 'vai alla riga', 'aller à la ligne'],
    'toggle comment':                       ['comentar / descomentar', 'comentar / descomentar', 'commenta / decommenta', 'commenter / décommenter'],
    'command palette':                      ['paleta de comandos', 'paleta de comandos', 'tavolozza comandi', 'palette de commandes'],
    'debug':                                ['depurar', 'depurar', 'debug', 'déboguer'],
    'theme':                                ['tema', 'tema', 'tema', 'thème'],
    'new terminal':                         ['nueva terminal', 'novo terminal', 'nuovo terminale', 'nouveau terminal'],
    'close terminal':                       ['cerrar terminal', 'fechar terminal', 'chiudi terminale', 'fermer le terminal'],
    'run file':                             ['ejecutar archivo', 'executar arquivo', 'esegui file', 'exécuter le fichier'],
    'issues':                               ['incidencias', 'problemas', 'segnalazioni', 'problèmes'],
    'about':                                ['acerca de', 'sobre', 'informazioni', 'à propos'],
    'contribute':                           ['contribuir', 'contribuir', 'contribuisci', 'contribuer'],
    'download spimhub':                     ['descargar spimhub', 'baixar spimhub', 'scarica spimhub', 'télécharger spimhub'],
    'copy path':                            ['copiar ruta', 'copiar caminho', 'copia percorso', 'copier le chemin'],
    'copy relative path':                   ['copiar ruta relativa', 'copiar caminho relativo', 'copia percorso relativo', 'copier le chemin relatif'],
    'rename file':                          ['renombrar archivo', 'renomear arquivo', 'rinomina file', 'renommer le fichier'],
    'rename folder':                        ['renombrar carpeta', 'renomear pasta', 'rinomina cartella', 'renommer le dossier'],
    'delete file':                          ['borrar archivo', 'excluir arquivo', 'elimina file', 'supprimer le fichier'],
    'delete folder':                        ['borrar carpeta', 'excluir pasta', 'elimina cartella', 'supprimer le dossier'],
    'open runner':                          ['abrir runner', 'abrir runner', 'apri runner', 'ouvrir le runner'],
    'codesnap':                             ['captura de código', 'captura de código', 'istantanea codice', 'capture du code'],
    'select all':                           ['seleccionar todo', 'selecionar tudo', 'seleziona tutto', 'tout sélectionner'],
    'kill process':                         ['matar proceso', 'encerrar processo', 'termina processo', 'tuer le processus'],
    'clear':                                ['limpiar', 'limpar', 'pulisci', 'effacer'],
    'download logs':                        ['descargar registros', 'baixar registros', 'scarica log', 'télécharger les journaux'],
    'show bkpt':                            ['ver breakpoints', 'ver breakpoints', 'mostra breakpoint', 'voir les points d’arrêt'],

    // ---- Sidebar / groups ----
    'runner':                               ['runner', 'runner', 'runner', 'runner'],
    'editor':                               ['editor', 'editor', 'editor', 'éditeur'],
    'pipeline':                             ['pipeline', 'pipeline', 'pipeline', 'pipeline'],
    'project':                              ['proyecto', 'projeto', 'progetto', 'projet'],
    'folder':                               ['carpeta', 'pasta', 'cartella', 'dossier'],
    'result':                               ['resultado', 'resultado', 'risultato', 'résultat'],

    // ---- Pop-ups ----
    'create file':                          ['crear archivo', 'criar arquivo', 'crea file', 'créer un fichier'],
    'create folder':                        ['crear carpeta', 'criar pasta', 'crea cartella', 'créer un dossier'],
    'ok':                                   ['aceptar', 'ok', 'ok', 'ok'],
    'cancel':                               ['cancelar', 'cancelar', 'annulla', 'annuler'],
    'yes':                                  ['sí', 'sim', 'sì', 'oui'],
    'no':                                   ['no', 'não', 'no', 'non'],
    'delete':                               ['borrar', 'excluir', 'elimina', 'supprimer'],
    'unsaved':                              ['sin guardar', 'não salvo', 'non salvato', 'non enregistré'],
    'confirm':                              ['confirmar', 'confirmar', 'conferma', 'confirmer'],
    'verification':                         ['verificación', 'verificação', 'verifica', 'vérification'],
    'click] or [drop':                      ['haz clic] o [suelta', 'clique] ou [solte', 'clicca] o [trascina', 'cliquez] ou [déposez'],
    'No file selected':                     ['Ningún archivo seleccionado', 'Nenhum arquivo selecionado', 'Nessun file selezionato', 'Aucun fichier sélectionné'],
    'This action will':                     ['Esta acción', 'Esta ação vai', 'Questa azione', 'Cette action va'],
    'destroy':                              ['destruirá', 'destruir', 'distruggerà', 'détruire'],
    'all your saved data.':                 ['todos tus datos guardados.', 'todos os seus dados salvos.', 'tutti i dati salvati.', 'toutes vos données.'],
    'the project first.':                   ['el proyecto primero.', 'o projeto primeiro.', 'prima il progetto.', 'd’abord le projet.'],
    'Are you sure you want to delete':      ['¿Seguro que quieres borrar', 'Tem certeza de que deseja excluir', 'Vuoi davvero eliminare', 'Voulez-vous vraiment supprimer'],
    'Do you want to save the changes you made to': ['¿Quieres guardar los cambios de', 'Deseja salvar as alterações em', 'Vuoi salvare le modifiche a', 'Voulez-vous enregistrer les modifications de'],
    'Write':                                ['Escribe', 'Escreva', 'Scrivi', 'Écrivez'],
    'to confirm before doing this action':  ['para confirmar esta acción', 'para confirmar esta ação', 'per confermare questa azione', 'pour confirmer cette action'],
    'Foldername or filename already exist.': ['La carpeta o el archivo ya existe.', 'A pasta ou o arquivo já existe.', 'La cartella o il file esiste già.', 'Le dossier ou le fichier existe déjà.'],

    // ---- Editor ----
    'run':                                  ['ejecutar', 'executar', 'esegui', 'exécuter'],
    'status':                               ['estado', 'estado', 'stato', 'état'],
    'error':                                ['error', 'erro', 'errore', 'erreur'],
    'match case':                           ['mayúsculas', 'maiúsculas', 'maiuscole', 'casse'],
    'Match case':                           ['Distinguir mayúsculas', 'Diferenciar maiúsculas', 'Maiuscole / minuscole', 'Respecter la casse'],
    'Whole word':                           ['Palabra completa', 'Palavra inteira', 'Parola intera', 'Mot entier'],
    'Regular expression':                   ['Expresión regular', 'Expressão regular', 'Espressione regolare', 'Expression régulière'],
    'Previous (Shift + Enter)':             ['Anterior (Shift + Enter)', 'Anterior (Shift + Enter)', 'Precedente (Shift + Invio)', 'Précédent (Maj + Entrée)'],
    'Next (Enter)':                         ['Siguiente (Enter)', 'Próximo (Enter)', 'Successivo (Invio)', 'Suivant (Entrée)'],
    'Replace (Alt + F)':                    ['Reemplazar (Alt + F)', 'Substituir (Alt + F)', 'Sostituisci (Alt + F)', 'Remplacer (Alt + F)'],
    'Close (Esc)':                          ['Cerrar (Esc)', 'Fechar (Esc)', 'Chiudi (Esc)', 'Fermer (Échap)'],
    'Replace (Enter)':                      ['Reemplazar (Enter)', 'Substituir (Enter)', 'Sostituisci (Invio)', 'Remplacer (Entrée)'],
    'Replace all (Ctrl + Alt + Enter)':     ['Reemplazar todo (Ctrl + Alt + Enter)', 'Substituir tudo (Ctrl + Alt + Enter)', 'Sostituisci tutto (Ctrl + Alt + Invio)', 'Tout remplacer (Ctrl + Alt + Entrée)'],
    'no results':                           ['sin resultados', 'sem resultados', 'nessun risultato', 'aucun résultat'],
    'invalid regex':                        ['regex no válida', 'regex inválida', 'regex non valida', 'regex invalide'],
    'Assemble and run the active file (Alt + Shift + R)': ['Ensamblar y ejecutar el archivo activo (Alt + Shift + R)', 'Montar e executar o arquivo ativo (Alt + Shift + R)', 'Assembla ed esegui il file attivo (Alt + Shift + R)', 'Assembler et exécuter le fichier actif (Alt + Maj + R)'],

    // ---- Search panel ----
    'search in all files':                  ['buscar en todos los archivos', 'pesquisar em todos os arquivos', 'cerca in tutti i file', 'rechercher dans tous les fichiers'],
    'files: *.asm, /examples/riscv/':       ['archivos: *.asm, /examples/riscv/', 'arquivos: *.asm, /examples/riscv/', 'file: *.asm, /examples/riscv/', 'fichiers : *.asm, /examples/riscv/'],
    'collapse':                             ['plegar', 'recolher', 'comprimi', 'replier'],
    'Collapse / expand all':                ['Plegar / desplegar todo', 'Recolher / expandir tudo', 'Comprimi / espandi tutto', 'Tout replier / déplier'],
    'Replace every match (Ctrl + Alt + Enter)': ['Reemplazar todas las coincidencias (Ctrl + Alt + Enter)', 'Substituir todas as ocorrências (Ctrl + Alt + Enter)', 'Sostituisci tutte le occorrenze (Ctrl + Alt + Invio)', 'Remplacer toutes les occurrences (Ctrl + Alt + Entrée)'],
    'Replace in this file':                 ['Reemplazar en este archivo', 'Substituir neste arquivo', 'Sostituisci in questo file', 'Remplacer dans ce fichier'],
    'type to search in every file of the project': ['escribe para buscar en todos los archivos del proyecto', 'digite para pesquisar em todos os arquivos do projeto', 'scrivi per cercare in tutti i file del progetto', 'tapez pour chercher dans tous les fichiers du projet'],
    'invalid regular expression':           ['expresión regular no válida', 'expressão regular inválida', 'espressione regolare non valida', 'expression régulière invalide'],

    // ---- Runner ----
    'assemble':                             ['ensamblar', 'montar', 'assembla', 'assembler'],
    'reset':                                ['reiniciar', 'reiniciar', 'reimposta', 'réinitialiser'],
    'pause':                                ['pausa', 'pausar', 'pausa', 'pause'],
    'run step':                             ['paso', 'passo', 'passo', 'pas à pas'],
    'run all':                              ['ejecutar todo', 'executar tudo', 'esegui tutto', 'tout exécuter'],
    'arch':                                 ['arq', 'arq', 'arch', 'arch'],
    'idle':                                 ['inactivo', 'inativo', 'inattivo', 'inactif'],
    'ready':                                ['listo', 'pronto', 'pronto', 'prêt'],
    'running':                              ['ejecutando', 'executando', 'in esecuzione', 'en cours'],
    'paused':                               ['en pausa', 'pausado', 'in pausa', 'en pause'],
    'input':                                ['entrada', 'entrada', 'input', 'saisie'],
    'exited':                               ['terminado', 'terminado', 'terminato', 'terminé'],
    'text segment':                         ['segmento de texto', 'segmento de texto', 'segmento testo', 'segment de texte'],
    'data segment':                         ['segmento de datos', 'segmento de dados', 'segmento dati', 'segment de données'],
    'address':                              ['dirección', 'endereço', 'indirizzo', 'adresse'],
    'code':                                 ['código', 'código', 'codice', 'code'],
    'basic':                                ['básica', 'básica', 'base', 'basique'],
    'source':                               ['fuente', 'fonte', 'sorgente', 'source'],
    'value':                                ['valor', 'valor', 'valore', 'valeur'],
    'value +0':                             ['valor +0', 'valor +0', 'valore +0', 'valeur +0'],
    'value +4':                             ['valor +4', 'valor +4', 'valore +4', 'valeur +4'],
    'value +8':                             ['valor +8', 'valor +8', 'valore +8', 'valeur +8'],
    'value +c':                             ['valor +c', 'valor +c', 'valore +c', 'valeur +c'],
    'registers':                            ['registros', 'registradores', 'registri', 'registres'],
    'register':                             ['registro', 'registrador', 'registro', 'registre'],
    'number':                               ['número', 'número', 'numero', 'numéro'],
    'single':                               ['simple', 'simples', 'singola', 'simple'],
    'double':                               ['doble', 'dupla', 'doppia', 'double'],
    'stack':                                ['pila', 'pilha', 'stack', 'pile'],
    'heap':                                 ['heap', 'heap', 'heap', 'tas'],
    'startup':                              ['arranque', 'inicialização', 'avvio', 'démarrage'],
    'output':                               ['salida', 'saída', 'output', 'sortie'],
    'console':                              ['consola', 'console', 'console', 'console'],
    'close':                                ['cerrar', 'fechar', 'chiudi', 'fermer'],
    'program input + [enter]':              ['entrada del programa + [enter]', 'entrada do programa + [enter]', 'input del programma + [invio]', 'saisie du programme + [entrée]'],
    'Assemble the active file (Alt + Shift + A)': ['Ensamblar el archivo activo (Alt + Shift + A)', 'Montar o arquivo ativo (Alt + Shift + A)', 'Assembla il file attivo (Alt + Shift + A)', 'Assembler le fichier actif (Alt + Maj + A)'],
    'Reset registers and memory':           ['Reiniciar registros y memoria', 'Reiniciar registradores e memória', 'Reimposta registri e memoria', 'Réinitialiser registres et mémoire'],
    'Pause the execution':                  ['Pausar la ejecución', 'Pausar a execução', 'Metti in pausa l’esecuzione', 'Mettre l’exécution en pause'],
    'Run one instruction (F10)':            ['Ejecutar una instrucción (F10)', 'Executar uma instrução (F10)', 'Esegui un’istruzione (F10)', 'Exécuter une instruction (F10)'],
    'Run until a breakpoint or the end (F5)': ['Ejecutar hasta un breakpoint o el final (F5)', 'Executar até um breakpoint ou o fim (F5)', 'Esegui fino a un breakpoint o alla fine (F5)', 'Exécuter jusqu’à un point d’arrêt ou la fin (F5)'],
    'Scroll to the current instruction':    ['Ir a la instrucción actual', 'Ir para a instrução atual', 'Vai all’istruzione corrente', 'Aller à l’instruction courante'],
    'Show values as ASCII':                 ['Ver los valores como ASCII', 'Ver os valores como ASCII', 'Mostra i valori come ASCII', 'Afficher les valeurs en ASCII'],
    'Switch between hexadecimal and decimal': ['Cambiar entre hexadecimal y decimal', 'Alternar entre hexadecimal e decimal', 'Passa da esadecimale a decimale', 'Basculer hexadécimal / décimal'],
    'Architecture: auto (detected), MIPS or RISC-V': ['Arquitectura: auto (detectada), MIPS o RISC-V', 'Arquitetura: auto (detectada), MIPS ou RISC-V', 'Architettura: auto (rilevata), MIPS o RISC-V', 'Architecture : auto (détectée), MIPS ou RISC-V'],
    '5 stage pipeline (Alt + L)':           ['Pipeline de 5 etapas (Alt + L)', 'Pipeline de 5 estágios (Alt + L)', 'Pipeline a 5 stadi (Alt + L)', 'Pipeline à 5 étages (Alt + L)'],
    'Breakpoint':                           ['Breakpoint', 'Breakpoint', 'Breakpoint', 'Point d’arrêt'],

    // ---- Pipeline ----
    'forwarding':                           ['cortocircuito', 'forwarding', 'forwarding', 'forwarding'],
    'branch':                               ['salto', 'desvio', 'salto', 'branchement'],
    'on':                                   ['sí', 'sim', 'sì', 'oui'],
    'off':                                  ['no', 'não', 'no', 'non'],
    'cycle':                                ['ciclo', 'ciclo', 'ciclo', 'cycle'],
    '< cycle':                              ['< ciclo', '< ciclo', '< ciclo', '< cycle'],
    'cycle >':                              ['ciclo >', 'ciclo >', 'ciclo >', 'cycle >'],
    'play':                                 ['animar', 'animar', 'anima', 'animer'],
    'instruction':                          ['instrucción', 'instrução', 'istruzione', 'instruction'],
    'instructions':                         ['instrucciones', 'instruções', 'istruzioni', 'instructions'],
    'cycles':                               ['ciclos', 'ciclos', 'cicli', 'cycles'],
    'stalls':                               ['paradas', 'paradas', 'stalli', 'suspensions'],
    'flushes':                              ['vaciados', 'descartes', 'svuotamenti', 'vidages'],
    'forwards':                             ['forwardings', 'forwardings', 'forwarding', 'forwardings'],
    'data':                                 ['datos', 'dados', 'dati', 'données'],
    'control':                              ['control', 'controle', 'controllo', 'contrôle'],
    'stall':                                ['parada', 'parada', 'stallo', 'suspension'],
    'flush':                                ['vaciado', 'descarte', 'svuotamento', 'vidage'],
    'IF fetch':                             ['IF búsqueda', 'IF busca', 'IF prelievo', 'IF lecture'],
    'ID decode / registers':                ['ID decodificación / registros', 'ID decodificação / registradores', 'ID decodifica / registri', 'ID décodage / registres'],
    'EX ALU':                               ['EX ALU', 'EX ULA', 'EX ALU', 'EX UAL'],
    'MEM data memory':                      ['MEM memoria de datos', 'MEM memória de dados', 'MEM memoria dati', 'MEM mémoire de données'],
    'WB write back':                        ['WB escritura', 'WB escrita', 'WB scrittura', 'WB écriture'],
    'Forwarding (bypass) unit':             ['Unidad de forwarding (cortocircuito)', 'Unidade de forwarding (adiantamento)', 'Unità di forwarding (inoltro)', 'Unité de forwarding (envoi anticipé)'],
    'Stage where branches are resolved (predict not taken)': ['Etapa donde se resuelven los saltos (predicción: no tomado)', 'Estágio onde os desvios são resolvidos (previsão: não tomado)', 'Stadio in cui si risolvono i salti (previsione: non preso)', 'Étage où les branchements sont résolus (prédiction : non pris)'],
    'First cycle':                          ['Primer ciclo', 'Primeiro ciclo', 'Primo ciclo', 'Premier cycle'],
    'Previous cycle':                       ['Ciclo anterior', 'Ciclo anterior', 'Ciclo precedente', 'Cycle précédent'],
    'Next cycle (executes the instructions it needs)': ['Ciclo siguiente (ejecuta las instrucciones que necesita)', 'Próximo ciclo (executa as instruções necessárias)', 'Ciclo successivo (esegue le istruzioni necessarie)', 'Cycle suivant (exécute les instructions nécessaires)'],
    'Animate cycle by cycle':               ['Animar ciclo a ciclo', 'Animar ciclo a ciclo', 'Anima ciclo per ciclo', 'Animer cycle par cycle'],
    'Run the whole program':                ['Ejecutar todo el programa', 'Executar o programa inteiro', 'Esegui tutto il programma', 'Exécuter tout le programme'],
    'Assemble a MIPS or RISC-V program first: [assemble] in the runner or Alt + Shift + A.': ['Primero ensambla un programa MIPS o RISC-V: [ensamblar] en el runner o Alt + Shift + A.', 'Primeiro monte um programa MIPS ou RISC-V: [montar] no runner ou Alt + Shift + A.', 'Prima assembla un programma MIPS o RISC-V: [assembla] nel runner o Alt + Shift + A.', 'Assemblez d’abord un programme MIPS ou RISC-V : [assembler] dans le runner ou Alt + Maj + A.'],
    'Try /examples/pipeline/riscv_hazards.asm': ['Prueba /examples/pipeline/riscv_hazards.asm', 'Experimente /examples/pipeline/riscv_hazards.asm', 'Prova /examples/pipeline/riscv_hazards.asm', 'Essayez /examples/pipeline/riscv_hazards.asm'],
    'memory map':                           ['mapa de memoria', 'mapa de memória', 'mappa di memoria', 'carte mémoire'],
    // Datapath blocks (built with T() in pipeline.ts, "\n" = two lines)
    'Instr\nmemory':                        ['Memoria\ninstr.', 'Memória\ninstr.', 'Memoria\nistr.', 'Mémoire\ninstr.'],
    'Data\nmemory':                         ['Memoria\ndatos', 'Memória\ndados', 'Memoria\ndati', 'Mémoire\ndonnées'],
    'Registers':                            ['Registros', 'Registradores', 'Registri', 'Registres'],
    'free':                                 ['libre', 'livre', 'libera', 'libre'],
    'decode':                               ['decodificar', 'decodificar', 'decodifica', 'décodage'],
    'compare':                              ['comparar', 'comparar', 'confronta', 'comparer'],
    'no memory access':                     ['sin acceso a memoria', 'sem acesso à memória', 'nessun accesso alla memoria', 'pas d’accès mémoire'],
    'address = base + offset':              ['dirección = base + desplazamiento', 'endereço = base + deslocamento', 'indirizzo = base + offset', 'adresse = base + décalage'],
    'stalled: waiting for an operand':      ['parada: esperando un operando', 'parada: aguardando um operando', 'in stallo: attende un operando', 'suspendue : attend un opérande'],
    'bubble (nop)':                         ['burbuja (nop)', 'bolha (nop)', 'bolla (nop)', 'bulle (nop)'],
    'EX: bubble (nop) inserted':            ['EX: burbuja (nop) insertada', 'EX: bolha (nop) inserida', 'EX: bolla (nop) inserita', 'EX : bulle (nop) insérée'],
    'no hazards':                           ['sin riesgos', 'sem hazards', 'nessun hazard', 'aucun aléa'],
    'fetched on the wrong path and flushed': ['buscada en el camino equivocado y descartada', 'buscada no caminho errado e descartada', 'prelevata sul percorso sbagliato e scartata', 'lue sur le mauvais chemin et vidée'],
    'stall in ID, - waiting in IF, x flushed': ['parada en ID, - esperando en IF, x descartada', 'parada em ID, - aguardando em IF, x descartada', 'stallo in ID, - attesa in IF, x scartata', 'suspension en ID, - attente en IF, x vidée'],

    // ---- Section titles ----
    '>_ executer':                          ['>_ ejecutor', '>_ executor', '>_ esecutore', '>_ exécuteur'],
    '>_ text segment':                      ['>_ segmento de texto', '>_ segmento de texto', '>_ segmento testo', '>_ segment de texte'],
    '>_ data segment':                      ['>_ segmento de datos', '>_ segmento de dados', '>_ segmento dati', '>_ segment de données'],
    '>_ pipeline':                          ['>_ pipeline', '>_ pipeline', '>_ pipeline', '>_ pipeline'],
    '>_ settings':                          ['>_ ajustes', '>_ configurações', '>_ impostazioni', '>_ paramètres'],
    '>_ extension':                         ['>_ extensión', '>_ extensão', '>_ estensione', '>_ extension'],
    'SpimHub - MIPS & RISC-V Assembly IDE': ['SpimHub - IDE de ensamblador MIPS y RISC-V', 'SpimHub - IDE de assembly MIPS e RISC-V', 'SpimHub - IDE assembly MIPS e RISC-V', 'SpimHub - IDE assembleur MIPS et RISC-V'],

    // ---- Status bar / palette ----
    'saved':                                ['guardado', 'salvo', 'salvato', 'enregistré'],
    'type a command':                       ['escribe un comando', 'digite um comando', 'scrivi un comando', 'tapez une commande'],
    'type a command, or a file name':       ['escribe un comando o un nombre de archivo', 'digite um comando ou um nome de arquivo', 'scrivi un comando o il nome di un file', 'tapez une commande ou un nom de fichier'],
    'line number':                          ['número de línea', 'número da linha', 'numero di riga', 'numéro de ligne'],
    'type a line number':                   ['escribe un número de línea', 'digite um número de linha', 'scrivi un numero di riga', 'tapez un numéro de ligne'],
    'no commands':                          ['sin comandos', 'sem comandos', 'nessun comando', 'aucune commande'],
    'Architecture (click to change)':       ['Arquitectura (clic para cambiar)', 'Arquitetura (clique para mudar)', 'Architettura (clic per cambiare)', 'Architecture (clic pour changer)'],
    'Runner':                               ['Runner', 'Runner', 'Runner', 'Runner'],
    'Go to line (Ctrl + G)':                ['Ir a la línea (Ctrl + G)', 'Ir para a linha (Ctrl + G)', 'Vai alla riga (Ctrl + G)', 'Aller à la ligne (Ctrl + G)'],
    'Command palette (Ctrl + Shift + P)':   ['Paleta de comandos (Ctrl + Shift + P)', 'Paleta de comandos (Ctrl + Shift + P)', 'Tavolozza comandi (Ctrl + Shift + P)', 'Palette de commandes (Ctrl + Maj + P)'],
    'drop files':                           ['soltar archivos', 'soltar arquivos', 'rilascia i file', 'déposer les fichiers'],
    'language':                             ['idioma', 'idioma', 'lingua', 'langue'],

    // ---- Palette commands ----
    'save file':                            ['guardar archivo', 'salvar arquivo', 'salva file', 'enregistrer le fichier'],
    'save all files':                       ['guardar todos los archivos', 'salvar todos os arquivos', 'salva tutti i file', 'enregistrer tous les fichiers'],
    'close all files':                      ['cerrar todos los archivos', 'fechar todos os arquivos', 'chiudi tutti i file', 'fermer tous les fichiers'],
    'download project (.spim)':             ['descargar proyecto (.spim)', 'baixar projeto (.spim)', 'scarica progetto (.spim)', 'télécharger le projet (.spim)'],
    'open project (.spim)':                 ['abrir proyecto (.spim)', 'abrir projeto (.spim)', 'apri progetto (.spim)', 'ouvrir un projet (.spim)'],
    'find in file':                         ['buscar en el archivo', 'localizar no arquivo', 'trova nel file', 'rechercher dans le fichier'],
    'replace in file':                      ['reemplazar en el archivo', 'substituir no arquivo', 'sostituisci nel file', 'remplacer dans le fichier'],
    'assemble active file':                 ['ensamblar archivo activo', 'montar arquivo ativo', 'assembla il file attivo', 'assembler le fichier actif'],
    'run active file':                      ['ejecutar archivo activo', 'executar arquivo ativo', 'esegui il file attivo', 'exécuter le fichier actif'],
    'reset the simulator':                  ['reiniciar el simulador', 'reiniciar o simulador', 'reimposta il simulatore', 'réinitialiser le simulateur'],
    'change architecture (auto / mips / risc-v)': ['cambiar arquitectura (auto / mips / risc-v)', 'mudar arquitetura (auto / mips / risc-v)', 'cambia architettura (auto / mips / risc-v)', 'changer d’architecture (auto / mips / risc-v)'],
    'open editor':                          ['abrir editor', 'abrir editor', 'apri editor', 'ouvrir l’éditeur'],
    'open pipeline':                        ['abrir pipeline', 'abrir pipeline', 'apri pipeline', 'ouvrir le pipeline'],
    'pipeline: toggle forwarding':          ['pipeline: activar / desactivar forwarding', 'pipeline: ativar / desativar forwarding', 'pipeline: attiva / disattiva forwarding', 'pipeline : activer / désactiver le forwarding'],
    'pipeline: branches in ID / EX':        ['pipeline: saltos en ID / EX', 'pipeline: desvios em ID / EX', 'pipeline: salti in ID / EX', 'pipeline : branchements en ID / EX'],
    'toggle terminal':                      ['mostrar / ocultar terminal', 'mostrar / ocultar terminal', 'mostra / nascondi terminale', 'afficher / masquer le terminal'],
    'show output':                          ['ver salida', 'ver saída', 'mostra output', 'voir la sortie'],
    'show console':                         ['ver consola', 'ver console', 'mostra console', 'voir la console'],
    'toggle light / dark theme':            ['tema claro / oscuro', 'tema claro / escuro', 'tema chiaro / scuro', 'thème clair / sombre'],
    'open settings':                        ['abrir ajustes', 'abrir configurações', 'apri impostazioni', 'ouvrir les paramètres'],
    'open extensions':                      ['abrir extensiones', 'abrir extensões', 'apri estensioni', 'ouvrir les extensions'],
    'new editor window':                    ['nueva ventana de editor', 'nova janela de editor', 'nuova finestra editor', 'nouvelle fenêtre d’éditeur'],

    // ---- Settings ----
    'appearance':                           ['apariencia', 'aparência', 'aspetto', 'apparence'],
    'light':                                ['claro', 'claro', 'chiaro', 'clair'],
    'dark':                                 ['oscuro', 'escuro', 'scuro', 'sombre'],
    'font size':                            ['tamaño de letra', 'tamanho da fonte', 'dimensione carattere', 'taille de police'],
    'tab size':                             ['tamaño del tabulador', 'tamanho da tabulação', 'dimensione tabulazione', 'taille de tabulation'],
    'autosave':                             ['autoguardado', 'salvamento automático', 'salvataggio automatico', 'enregistrement auto'],
    'saves every open file 1s after typing': ['guarda los archivos abiertos 1 s después de escribir', 'salva os arquivos abertos 1 s após digitar', 'salva i file aperti 1 s dopo la digitazione', 'enregistre les fichiers ouverts 1 s après la saisie'],
    'architecture':                         ['arquitectura', 'arquitetura', 'architettura', 'architecture'],
    'auto: detected from the source':       ['auto: detectada en el código', 'auto: detectada no código', 'auto: rilevata dal codice', 'auto : détectée dans le code'],
    'branches resolved in':                 ['saltos resueltos en', 'desvios resolvidos em', 'salti risolti in', 'branchements résolus en'],
    'extension servers':                    ['servidores de extensiones', 'servidores de extensões', 'server di estensioni', 'serveurs d’extensions'],
    'add server':                           ['añadir servidor', 'adicionar servidor', 'aggiungi server', 'ajouter un serveur'],
    'name':                                 ['nombre', 'nome', 'nome', 'nom'],
    'disable':                              ['desactivar', 'desativar', 'disattiva', 'désactiver'],
    'enable':                               ['activar', 'ativar', 'attiva', 'activer'],
    'remove':                               ['eliminar', 'remover', 'rimuovi', 'supprimer'],
    '(default)':                            ['(por defecto)', '(padrão)', '(predefinito)', '(par défaut)'],
    'disabled':                             ['desactivado', 'desativado', 'disattivato', 'désactivé'],
    'offline':                              ['sin conexión', 'offline', 'offline', 'hors ligne'],
    'loading...':                           ['cargando...', 'carregando...', 'caricamento...', 'chargement...'],
    'no servers':                           ['sin servidores', 'sem servidores', 'nessun server', 'aucun serveur'],
    'download project':                     ['descargar proyecto', 'baixar projeto', 'scarica progetto', 'télécharger le projet'],
    'reset settings':                       ['restablecer ajustes', 'restaurar configurações', 'ripristina impostazioni', 'réinitialiser les paramètres'],
    'Files, settings and extensions are saved in this browser (localStorage).': ['Los archivos, ajustes y extensiones se guardan en este navegador (localStorage).', 'Arquivos, configurações e extensões ficam salvos neste navegador (localStorage).', 'File, impostazioni ed estensioni sono salvati in questo browser (localStorage).', 'Fichiers, paramètres et extensions sont enregistrés dans ce navigateur (localStorage).'],
    'A server is a folder served over HTTP with an': ['Un servidor es una carpeta servida por HTTP con un', 'Um servidor é uma pasta servida por HTTP com um', 'Un server è una cartella servita via HTTP con un', 'Un serveur est un dossier servi en HTTP avec un'],
    'in its root and one folder per extension': ['en la raíz y una carpeta por extensión', 'na raiz e uma pasta por extensão', 'nella radice e una cartella per estensione', 'à la racine et un dossier par extension'],
    '...). Extensions run JavaScript inside SpimHub: add only servers you trust.\n            Example: the': ['...). Las extensiones ejecutan JavaScript dentro de SpimHub: añade solo servidores de confianza.\n            Ejemplo: la carpeta', '...). As extensões executam JavaScript dentro do SpimHub: adicione só servidores confiáveis.\n            Exemplo: a pasta', '...). Le estensioni eseguono JavaScript in SpimHub: aggiungi solo server fidati.\n            Esempio: la cartella', '...). Les extensions exécutent du JavaScript dans SpimHub : n’ajoutez que des serveurs de confiance.\n            Exemple : le dossier'],
    'folder of the repository.':            ['del repositorio.', 'do repositório.', 'del repository.', 'du dépôt.'],

    // ---- Extensions ----
    'search extensions':                    ['buscar extensiones', 'pesquisar extensões', 'cerca estensioni', 'rechercher des extensions'],
    'installed':                            ['instaladas', 'instaladas', 'installate', 'installées'],
    'marketplace':                          ['tienda', 'loja', 'negozio', 'boutique'],
    'refresh':                              ['actualizar', 'atualizar', 'aggiorna', 'actualiser'],
    'servers':                              ['servidores', 'servidores', 'server', 'serveurs'],
    'install':                              ['instalar', 'instalar', 'installa', 'installer'],
    'update':                               ['actualizar', 'atualizar', 'aggiorna', 'mettre à jour'],
    'Uninstall':                            ['Desinstalar', 'Desinstalar', 'Disinstalla', 'Désinstaller'],
    'loading servers...':                   ['cargando servidores...', 'carregando servidores...', 'caricamento server...', 'chargement des serveurs...'],
    'no extensions installed':              ['no hay extensiones instaladas', 'nenhuma extensão instalada', 'nessuna estensione installata', 'aucune extension installée'],
    'no extensions (check the servers)':    ['no hay extensiones (revisa los servidores)', 'nenhuma extensão (verifique os servidores)', 'nessuna estensione (controlla i server)', 'aucune extension (vérifiez les serveurs)'],
    'extension':                            ['extensión', 'extensão', 'estensione', 'extension'],
    'id':                                   ['id', 'id', 'id', 'id'],
    'server':                               ['servidor', 'servidor', 'server', 'serveur'],
    'tags':                                 ['etiquetas', 'etiquetas', 'tag', 'étiquettes'],
    'no README':                            ['sin README', 'sem README', 'nessun README', 'pas de README'],
    'install the extension to read its documentation': ['instala la extensión para leer su documentación', 'instale a extensão para ler a documentação', 'installa l’estensione per leggerne la documentazione', 'installez l’extension pour lire sa documentation'],
    'Choose an extension on the left. Extensions come from servers (repositories) that you can add in [settings].': ['Elige una extensión a la izquierda. Las extensiones vienen de servidores (repositorios) que puedes añadir en [ajustes].', 'Escolha uma extensão à esquerda. As extensões vêm de servidores (repositórios) que você pode adicionar em [configurações].', 'Scegli un’estensione a sinistra. Le estensioni provengono da server (repository) che puoi aggiungere in [impostazioni].', 'Choisissez une extension à gauche. Les extensions viennent de serveurs (dépôts) que vous pouvez ajouter dans [paramètres].'],
    'open':                                 ['abrir', 'abrir', 'apri', 'ouvrir'],
    'add':                                  ['añadir', 'adicionar', 'aggiungi', 'ajouter'],
    'uninstall':                            ['desinstalar', 'desinstalar', 'disinstalla', 'désinstaller'],
    'auto':                                 ['auto', 'auto', 'auto', 'auto'],
    'mips':                                 ['mips', 'mips', 'mips', 'mips'],
    'risc-v':                               ['risc-v', 'risc-v', 'risc-v', 'risc-v'],
    'EX':                                   ['EX', 'EX', 'EX', 'EX'],
    'ID':                                   ['ID', 'ID', 'ID', 'ID'],
    '● unsaved':                            ['● sin guardar', '● não salvo', '● non salvato', '● non enregistré'],
    'Files of the computer':                ['Archivos del ordenador', 'Arquivos do computador', 'File del computer', 'Fichiers de l’ordinateur'],
    'A server is a folder served over HTTP with an index.json in its root and one folder per extension (manifest.json, main.js...). Extensions run JavaScript inside SpimHub: add only servers you trust. Example: the extensions/ folder of the repository.':
        ['Un servidor es una carpeta servida por HTTP con un index.json en la raíz y una carpeta por extensión (manifest.json, main.js...). Las extensiones ejecutan JavaScript dentro de SpimHub: añade solo servidores de confianza. Ejemplo: la carpeta extensions/ del repositorio.',
         'Um servidor é uma pasta servida por HTTP com um index.json na raiz e uma pasta por extensão (manifest.json, main.js...). As extensões executam JavaScript dentro do SpimHub: adicione só servidores confiáveis. Exemplo: a pasta extensions/ do repositório.',
         'Un server è una cartella servita via HTTP con un index.json nella radice e una cartella per estensione (manifest.json, main.js...). Le estensioni eseguono JavaScript in SpimHub: aggiungi solo server fidati. Esempio: la cartella extensions/ del repository.',
         'Un serveur est un dossier servi en HTTP avec un index.json à la racine et un dossier par extension (manifest.json, main.js...). Les extensions exécutent du JavaScript dans SpimHub : n’ajoutez que des serveurs de confiance. Exemple : le dossier extensions/ du dépôt.'],

    // ---- Terminal ----
    'SpimHub terminal. Available commands:': ['Terminal de SpimHub. Comandos disponibles:', 'Terminal do SpimHub. Comandos disponíveis:', 'Terminale di SpimHub. Comandi disponibili:', 'Terminal SpimHub. Commandes disponibles :'],
    'Shortcuts: F5 run · F10 step · Alt+Shift+R run active file · Ctrl+C pause · ↑↓ history · Tab complete':
        ['Atajos: F5 ejecutar · F10 paso · Alt+Shift+R ejecutar archivo activo · Ctrl+C pausa · ↑↓ historial · Tab completar',
         'Atalhos: F5 executar · F10 passo · Alt+Shift+R executar arquivo ativo · Ctrl+C pausa · ↑↓ histórico · Tab completar',
         'Scorciatoie: F5 esegui · F10 passo · Alt+Shift+R esegui file attivo · Ctrl+C pausa · ↑↓ cronologia · Tab completa',
         'Raccourcis : F5 exécuter · F10 pas à pas · Alt+Maj+R exécuter le fichier actif · Ctrl+C pause · ↑↓ historique · Tab compléter'],
    'show this help':                       ['muestra esta ayuda', 'mostra esta ajuda', 'mostra questo aiuto', 'affiche cette aide'],
    'clear the terminal':                   ['limpia la terminal', 'limpa o terminal', 'pulisce il terminale', 'efface le terminal'],
    'print the current folder':             ['muestra la carpeta actual', 'mostra a pasta atual', 'mostra la cartella corrente', 'affiche le dossier courant'],
    'list a folder':                        ['lista una carpeta', 'lista uma pasta', 'elenca una cartella', 'liste un dossier'],
    'show the project tree':                ['muestra el árbol del proyecto', 'mostra a árvore do projeto', 'mostra l’albero del progetto', 'affiche l’arbre du projet'],
    'change the current folder':            ['cambia la carpeta actual', 'muda a pasta atual', 'cambia la cartella corrente', 'change de dossier'],
    'print a file':                         ['muestra un archivo', 'mostra um arquivo', 'mostra un file', 'affiche un fichier'],
    'open a file in the editor':            ['abre un archivo en el editor', 'abre um arquivo no editor', 'apre un file nell’editor', 'ouvre un fichier dans l’éditeur'],
    'create a new .asm file':               ['crea un archivo .asm', 'cria um arquivo .asm', 'crea un file .asm', 'crée un fichier .asm'],
    'create a folder':                      ['crea una carpeta', 'cria uma pasta', 'crea una cartella', 'crée un dossier'],
    'assemble and run a file (default: active file)': ['ensambla y ejecuta un archivo (por defecto: el activo)', 'monta e executa um arquivo (padrão: o ativo)', 'assembla ed esegue un file (predefinito: quello attivo)', 'assemble et exécute un fichier (par défaut : l’actif)'],
    'same as run (spim compatibility)':     ['igual que run (compatible con spim)', 'igual a run (compatível com spim)', 'come run (compatibilità spim)', 'comme run (compatibilité spim)'],
    'assemble a file without running it':   ['ensambla un archivo sin ejecutarlo', 'monta um arquivo sem executá-lo', 'assembla un file senza eseguirlo', 'assemble un fichier sans l’exécuter'],
    'execute n instructions (default 1)':   ['ejecuta n instrucciones (por defecto 1)', 'executa n instruções (padrão 1)', 'esegue n istruzioni (predefinito 1)', 'exécute n instructions (par défaut 1)'],
    'continue the execution':               ['continúa la ejecución', 'continua a execução', 'continua l’esecuzione', 'continue l’exécution'],
    'pause the execution (Ctrl + C)':       ['pausa la ejecución (Ctrl + C)', 'pausa a execução (Ctrl + C)', 'mette in pausa (Ctrl + C)', 'met en pause (Ctrl + C)'],
    'reset registers and memory':           ['reinicia registros y memoria', 'reinicia registradores e memória', 'reimposta registri e memoria', 'réinitialise registres et mémoire'],
    'print registers':                      ['muestra los registros', 'mostra os registradores', 'mostra i registri', 'affiche les registres'],
    'print memory words':                   ['muestra palabras de memoria', 'mostra palavras da memória', 'mostra parole di memoria', 'affiche des mots mémoire'],
    'toggle a breakpoint / list them':      ['pone / quita un breakpoint o los lista', 'alterna um breakpoint ou os lista', 'attiva / disattiva un breakpoint o li elenca', 'ajoute / retire un point d’arrêt ou les liste'],
    'print the symbol table':               ['muestra la tabla de símbolos', 'mostra a tabela de símbolos', 'mostra la tabella dei simboli', 'affiche la table des symboles'],
    'open the pipeline view / change its options': ['abre el pipeline / cambia sus opciones', 'abre o pipeline / muda suas opções', 'apre il pipeline / ne cambia le opzioni', 'ouvre le pipeline / change ses options'],
    'change the theme':                     ['cambia el tema', 'muda o tema', 'cambia il tema', 'change le thème'],
    'print text':                           ['muestra un texto', 'mostra um texto', 'stampa un testo', 'affiche un texte'],
    'show the command history':             ['muestra el historial', 'mostra o histórico', 'mostra la cronologia', 'affiche l’historique'],
    'print the version':                    ['muestra la versión', 'mostra a versão', 'mostra la versione', 'affiche la version'],
    'extension not found':                  ['extensión no encontrada', 'extensão não encontrada', 'estensione non trovata', 'extension introuvable'],
};

// ================== //
//  Patterns          //
// ================== //
/*
    Messages with values. {1} = group 1 as it is, {t1} = group 1 translated.
*/
const PATTERNS: [RegExp, Row][] = [
    // ---- Assembler ----
    [/^(.+?):(\d+): error: (.+)$/, ['{1}:{2}: error: {t3}', '{1}:{2}: erro: {t3}', '{1}:{2}: errore: {t3}', '{1}:{2} : erreur : {t3}']],
    [/^(.+?):(\d+): warning: (.+)$/, ['{1}:{2}: aviso: {t3}', '{1}:{2}: aviso: {t3}', '{1}:{2}: avviso: {t3}', '{1}:{2} : avertissement : {t3}']],
    [/^unknown instruction "(.+)"$/, ['instrucción desconocida "{1}"', 'instrução desconhecida "{1}"', 'istruzione sconosciuta "{1}"', 'instruction inconnue « {1} »']],
    [/^unknown directive "(.+)"$/, ['directiva desconocida "{1}"', 'diretiva desconhecida "{1}"', 'direttiva sconosciuta "{1}"', 'directive inconnue « {1} »']],
    [/^undefined symbol "(.+)"$/, ['símbolo no definido "{1}"', 'símbolo não definido "{1}"', 'simbolo non definito "{1}"', 'symbole non défini « {1} »']],
    [/^invalid register "(.+?)"(.*)$/, ['registro no válido "{1}"{2}', 'registrador inválido "{1}"{2}', 'registro non valido "{1}"{2}', 'registre invalide « {1} »{2}']],
    [/^label "(.+)" is defined twice$/, ['la etiqueta "{1}" está definida dos veces', 'o rótulo "{1}" está definido duas vezes', 'l’etichetta "{1}" è definita due volte', 'l’étiquette « {1} » est définie deux fois']],
    [/^syntax error near "(.+)"$/, ['error de sintaxis cerca de "{1}"', 'erro de sintaxe perto de "{1}"', 'errore di sintassi vicino a "{1}"', 'erreur de syntaxe près de « {1} »']],
    [/^"(.+?)" expects (\d+) operand\(s\): (.*)$/, ['"{1}" espera {2} operando(s): {3}', '"{1}" espera {2} operando(s): {3}', '"{1}" richiede {2} operando/i: {3}', '« {1} » attend {2} opérande(s) : {3}']],
    [/^"(.+?)" expects (.+)$/, ['"{1}" espera {2}', '"{1}" espera {2}', '"{1}" richiede {2}', '« {1} » attend {2}']],
    [/^immediate (-?\d+) out of range (.+)$/, ['inmediato {1} fuera de rango {2}', 'imediato {1} fora do intervalo {2}', 'immediato {1} fuori intervallo {2}', 'immédiat {1} hors limites {2}']],
    [/^offset (-?\d+) out of range (.+)$/, ['desplazamiento {1} fuera de rango {2}', 'deslocamento {1} fora do intervalo {2}', 'offset {1} fuori intervallo {2}', 'décalage {1} hors limites {2}']],
    [/^shift amount (-?\d+) out of range (.+)$/, ['desplazamiento de bits {1} fuera de rango {2}', 'deslocamento de bits {1} fora do intervalo {2}', 'scorrimento {1} fuori intervallo {2}', 'décalage de bits {1} hors limites {2}']],
    [/^(branch target|jump target|target) (0x[0-9a-f]+) out of range(.*)$/, ['destino {2} fuera de rango{3}', 'destino {2} fora do alcance{3}', 'destinazione {2} fuori portata{3}', 'cible {2} hors de portée{3}']],
    [/^the following symbols are undefined: (.+)$/, ['estos símbolos no están definidos: {1}', 'estes símbolos não estão definidos: {1}', 'questi simboli non sono definiti: {1}', 'ces symboles ne sont pas définis : {1}']],
    [/^"(.+?)" needs 3 registers, use "(.+?)" for an immediate$/, ['"{1}" necesita 3 registros, usa "{2}" para un inmediato', '"{1}" precisa de 3 registradores, use "{2}" para um imediato', '"{1}" richiede 3 registri, usa "{2}" per un immediato', '« {1} » demande 3 registres, utilisez « {2} » pour un immédiat']],
    [/^assemble failed: (\d+) error\(s\)$/, ['ensamblado fallido: {1} error(es)', 'montagem falhou: {1} erro(s)', 'assemblaggio fallito: {1} errore/i', 'échec de l’assemblage : {1} erreur(s)']],
    [/^(.+) assembled in ([\d.]+)ms: (\d+) instructions, (\d+) bytes of data$/, ['{1} ensamblado en {2} ms: {3} instrucciones, {4} bytes de datos', '{1} montado em {2} ms: {3} instruções, {4} bytes de dados', '{1} assemblato in {2} ms: {3} istruzioni, {4} byte di dati', '{1} assemblé en {2} ms : {3} instructions, {4} octets de données']],
    [/^(\d+) error\(s\) in \[(.+)\]\. See \[console\]\.$/, ['{1} error(es) en [{2}]. Mira la [consola].', '{1} erro(s) em [{2}]. Veja o [console].', '{1} errore/i in [{2}]. Vedi la [console].', '{1} erreur(s) dans [{2}]. Voir la [console].']],
    [/^(.+) assembled$/, ['{1} ensamblado', '{1} montado', '{1} assemblato', '{1} assemblé']],
    [/^(.+): errors, see \[console\]$/, ['{1}: errores, mira la [consola]', '{1}: erros, veja o [console]', '{1}: errori, vedi la [console]', '{1} : erreurs, voir la [console]']],

    // ---- Execution ----
    [/^program exited with code (-?\d+) after (\d+) instructions$/, ['el programa terminó con código {1} tras {2} instrucciones', 'o programa terminou com código {1} após {2} instruções', 'il programma è terminato con codice {1} dopo {2} istruzioni', 'le programme s’est terminé avec le code {1} après {2} instructions']],
    [/^paused at (0x[0-9a-f]+) after (\d+) instructions$/, ['pausado en {1} tras {2} instrucciones', 'pausado em {1} após {2} instruções', 'in pausa a {1} dopo {2} istruzioni', 'en pause à {1} après {2} instructions']],
    [/^breakpoint at (0x[0-9a-f]+)$/, ['breakpoint en {1}', 'breakpoint em {1}', 'breakpoint a {1}', 'point d’arrêt à {1}']],
    [/^Exception (\d+) \[(.+?)\] at (0x[0-9a-f]+): (.+?)( \(.+\))?$/, ['Excepción {1} [{t2}] en {3}: {t4}{5}', 'Exceção {1} [{t2}] em {3}: {t4}{5}', 'Eccezione {1} [{t2}] a {3}: {t4}{5}', 'Exception {1} [{t2}] à {3} : {t4}{5}']],
    [/^bad address (0x[0-9a-f]+)$/, ['dirección no válida {1}', 'endereço inválido {1}', 'indirizzo non valido {1}', 'adresse invalide {1}']],
    [/^unaligned address (0x[0-9a-f]+)$/, ['dirección no alineada {1}', 'endereço não alinhado {1}', 'indirizzo non allineato {1}', 'adresse non alignée {1}']],
    [/^cannot write to the text segment (0x[0-9a-f]+)$/, ['no se puede escribir en el segmento de texto {1}', 'não é possível escrever no segmento de texto {1}', 'impossibile scrivere nel segmento testo {1}', 'impossible d’écrire dans le segment de texte {1}']],
    [/^unknown syscall (-?\d+)$/, ['syscall desconocida {1}', 'syscall desconhecida {1}', 'syscall sconosciuta {1}', 'syscall inconnu {1}']],
    [/^attempt to execute non-instruction at (0x[0-9a-f]+)(.*)$/, ['intento de ejecutar algo que no es una instrucción en {1}{t2}', 'tentativa de executar algo que não é instrução em {1}{t2}', 'tentativo di eseguire una non-istruzione a {1}{t2}', 'tentative d’exécuter une non-instruction à {1}{t2}']],
    [/^ \(did you forget to exit with the exit syscall\?\)$/, [' (¿olvidaste terminar con la syscall de salida?)', ' (esqueceu de terminar com a syscall de saída?)', ' (hai dimenticato di uscire con la syscall di uscita?)', ' (avez-vous oublié de terminer avec le syscall de sortie ?)']],
    [/^Arithmetic overflow$/, ['Desbordamiento aritmético', 'Overflow aritmético', 'Overflow aritmetico', 'Dépassement arithmétique']],
    [/^arithmetic overflow$/, ['desbordamiento aritmético', 'overflow aritmético', 'overflow aritmetico', 'dépassement arithmétique']],
    [/^Address error in inst\/data fetch$/, ['Error de dirección al leer', 'Erro de endereço na leitura', 'Errore di indirizzo in lettura', 'Erreur d’adresse en lecture']],
    [/^Address error in store$/, ['Error de dirección al escribir', 'Erro de endereço na escrita', 'Errore di indirizzo in scrittura', 'Erreur d’adresse en écriture']],
    [/^Load access fault$/, ['Fallo de acceso en lectura', 'Falha de acesso na leitura', 'Errore di accesso in lettura', 'Faute d’accès en lecture']],
    [/^Store access fault$/, ['Fallo de acceso en escritura', 'Falha de acesso na escrita', 'Errore di accesso in scrittura', 'Faute d’accès en écriture']],
    [/^(Reserved|Illegal) instruction$/, ['Instrucción no válida', 'Instrução inválida', 'Istruzione non valida', 'Instruction invalide']],
    [/^Error in syscall$|^Environment call$/, ['Error en syscall', 'Erro na syscall', 'Errore nella syscall', 'Erreur de syscall']],

    // ---- UI messages ----
    [/^No file opened\. Open or create an \.asm file first\.$/, ['No hay ningún archivo abierto. Abre o crea un archivo .asm.', 'Nenhum arquivo aberto. Abra ou crie um arquivo .asm.', 'Nessun file aperto. Apri o crea un file .asm.', 'Aucun fichier ouvert. Ouvrez ou créez un fichier .asm.']],
    [/^architecture: (.+)$/, ['arquitectura: {1}', 'arquitetura: {1}', 'architettura: {1}', 'architecture : {1}']],
    [/^(\d+) replacements? in (.+)$/, ['{1} reemplazo(s) en {2}', '{1} substituição(ões) em {2}', '{1} sostituzione/i in {2}', '{1} remplacement(s) dans {2}']],
    [/^(\d+) files? imported into (.+)$/, ['{1} archivo(s) importado(s) en {2}', '{1} arquivo(s) importado(s) em {2}', '{1} file importato/i in {2}', '{1} fichier(s) importé(s) dans {2}']],
    [/^moved (.+) → (.+)$/, ['movido {1} → {2}', 'movido {1} → {2}', 'spostato {1} → {2}', 'déplacé {1} → {2}']],
    [/^(.+) already exists$/, ['{1} ya existe', '{1} já existe', '{1} esiste già', '{1} existe déjà']],
    [/^open a file first$/, ['abre un archivo primero', 'abra um arquivo primeiro', 'apri prima un file', 'ouvrez d’abord un fichier']],
    [/^open a file to search in it$/, ['abre un archivo para buscar en él', 'abra um arquivo para pesquisar nele', 'apri un file per cercarvi', 'ouvrez un fichier pour y chercher']],
    [/^(\d+) extensions installed: (.+)$/, ['{1} extensiones instaladas: {2}', '{1} extensões instaladas: {2}', '{1} estensioni installate: {2}', '{1} extensions installées : {2}']],
    [/^(.+) (\d+\.\d+\.\d+) (installed|updated)$/, ['{1} {2} {t3}', '{1} {2} {t3}', '{1} {2} {t3}', '{1} {2} {t3}']],
    [/^installed$/, ['instalada', 'instalada', 'installata', 'installée']],
    [/^updated$/, ['actualizada', 'atualizada', 'aggiornata', 'mise à jour']],
    [/^(.+) uninstalled$/, ['{1} desinstalada', '{1} desinstalada', '{1} disinstallata', '{1} désinstallée']],
    [/^settings restored$/, ['ajustes restablecidos', 'configurações restauradas', 'impostazioni ripristinate', 'paramètres réinitialisés']],
    [/^(\d+)\/(\d+) servers online · \[servers\]$/, ['{1}/{2} servidores en línea · [servidores]', '{1}/{2} servidores online · [servidores]', '{1}/{2} server online · [server]', '{1}/{2} serveurs en ligne · [serveurs]']],
    [/^(\d+)\/(\d+) servers online · $/, ['{1}/{2} servidores en línea · ', '{1}/{2} servidores online · ', '{1}/{2} server online · ', '{1}/{2} serveurs en ligne · ']],
    [/^online · (\d+) extensions$/, ['en línea · {1} extensiones', 'online · {1} extensões', 'online · {1} estensioni', 'en ligne · {1} extensions']],
    [/^(\d+) online$/, ['{1} en línea', '{1} online', '{1} online', '{1} en ligne']],
    [/^(\d+) servers$/, ['{1} servidores', '{1} servidores', '{1} server', '{1} serveurs']],
    [/^no breakpoints\. (.+)$/, ['no hay breakpoints. Marca la columna [bkpt] del segmento de texto para añadir uno', 'não há breakpoints. Marque a coluna [bkpt] do segmento de texto para adicionar um', 'nessun breakpoint. Spunta la colonna [bkpt] del segmento testo per aggiungerne uno', 'aucun point d’arrêt. Cochez la colonne [bkpt] du segment de texte pour en ajouter']],
    // ---- Pipeline view ----
    [/^line (\d+)$/, ['línea {1}', 'linha {1}', 'riga {1}', 'ligne {1}']],
    [/^cycle (\d+)$/, ['ciclo {1}', 'ciclo {1}', 'ciclo {1}', 'cycle {1}']],
    [/^cycle (\d+) \/ (\d+)$/, ['ciclo {1} / {2}', 'ciclo {1} / {2}', 'ciclo {1} / {2}', 'cycle {1} / {2}']],
    [/^fetch (0x[0-9a-f]+)$/, ['busca {1}', 'busca {1}', 'prelievo {1}', 'lecture {1}']],
    [/^read (0x[0-9a-f]+)$/, ['lee {1}', 'lê {1}', 'legge {1}', 'lit {1}']],
    [/^write (0x[0-9a-f]+)$/, ['escribe {1}', 'escreve {1}', 'scrive {1}', 'écrit {1}']],
    [/^read (.+)$/, ['lee {1}', 'lê {1}', 'legge {1}', 'lit {1}']],
    [/^(\S+) taken → (0x[0-9a-f]+): flush IF( \+ ID)?$/, ['{1} tomado → {2}: descarta IF{3}', '{1} tomado → {2}: descarta IF{3}', '{1} preso → {2}: scarta IF{3}', '{1} pris → {2} : vide IF{3}']],
    [/^ID stalled: (.+)$/, ['ID parada: {t1}', 'ID parada: {t1}', 'ID in stallo: {t1}', 'ID suspendue : {t1}']],
    [/^(IF|ID|EX|MEM|WB): #(\d+) wrong path, it will be flushed$/, ['{1}: #{2} camino equivocado, se descartará', '{1}: #{2} caminho errado, será descartada', '{1}: #{2} percorso sbagliato, sarà scartata', '{1} : #{2} mauvais chemin, sera vidée']],
    [/^RAW (\S+) ← (#\d+ .+?): (\d+) stalls? \+ forwarding (.+?) \(load-use\)$/, ['RAW {1} ← {2}: {3} ciclo(s) de parada + forwarding {4} (load-use)', 'RAW {1} ← {2}: {3} ciclo(s) de parada + forwarding {4} (load-use)', 'RAW {1} ← {2}: {3} ciclo/i di stallo + forwarding {4} (load-use)', 'RAW {1} ← {2} : {3} cycle(s) de suspension + forwarding {4} (load-use)']],
    [/^RAW (\S+) ← (#\d+ .+?): (\d+) stalls? \+ forwarding (.+?)( \(branch in ID\))?$/, ['RAW {1} ← {2}: {3} ciclo(s) de parada + forwarding {4}{t5}', 'RAW {1} ← {2}: {3} ciclo(s) de parada + forwarding {4}{t5}', 'RAW {1} ← {2}: {3} ciclo/i di stallo + forwarding {4}{t5}', 'RAW {1} ← {2} : {3} cycle(s) de suspension + forwarding {4}{t5}']],
    [/^RAW (\S+) ← (#\d+ .+?): (\d+) stalls? \(no forwarding\)$/, ['RAW {1} ← {2}: {3} ciclo(s) de parada (sin forwarding)', 'RAW {1} ← {2}: {3} ciclo(s) de parada (sem forwarding)', 'RAW {1} ← {2}: {3} ciclo/i di stallo (senza forwarding)', 'RAW {1} ← {2} : {3} cycle(s) de suspension (sans forwarding)']],
    [/^RAW (\S+) ← (#\d+ .+?): forwarding (.+)$/, ['RAW {1} ← {2}: forwarding {3}', 'RAW {1} ← {2}: forwarding {3}', 'RAW {1} ← {2}: forwarding {3}', 'RAW {1} ← {2} : forwarding {3}']],
    [/^ \(branch in ID\)$/, [' (salto en ID)', ' (desvio em ID)', ' (salto in ID)', ' (branchement en ID)']],
    [/^(jump|jump register|taken branch|exception) resolved in (ID|EX): (\d+) instructions? flushed \((\d+) cycles? lost\)$/, ['{t1} resuelto en {2}: {3} instrucción(es) descartada(s) ({4} ciclo(s) perdido(s))', '{t1} resolvido em {2}: {3} instrução(ões) descartada(s) ({4} ciclo(s) perdido(s))', '{t1} risolto in {2}: {3} istruzione/i scartata/e ({4} ciclo/i perso/i)', '{t1} résolu en {2} : {3} instruction(s) vidée(s) ({4} cycle(s) perdu(s))']],
    [/^jump$/, ['salto incondicional', 'salto incondicional', 'salto incondizionato', 'saut']],
    [/^jump register$/, ['salto a registro', 'salto para registrador', 'salto a registro', 'saut par registre']],
    [/^taken branch$/, ['salto condicional tomado', 'desvio tomado', 'salto condizionale preso', 'branchement pris']],
    [/^exception$/, ['excepción', 'exceção', 'eccezione', 'exception']],
    [/^trace limited to (\d+) instructions$/, ['traza limitada a {1} instrucciones', 'traço limitado a {1} instruções', 'traccia limitata a {1} istruzioni', 'trace limitée à {1} instructions']],

    // ---- Status bar / search ----
    [/^Ln (\d+), Col (\d+)$/, ['Lín {1}, Col {2}', 'Lin {1}, Col {2}', 'Riga {1}, Col {2}', 'Ligne {1}, Col {2}']],
    [/^Ln (\d+), Col (\d+) \((\d+) selected\)$/, ['Lín {1}, Col {2} ({3} seleccionados)', 'Lin {1}, Col {2} ({3} selecionados)', 'Riga {1}, Col {2} ({3} selezionati)', 'Ligne {1}, Col {2} ({3} sélectionnés)']],
    [/^spaces: (\d+)$/, ['espacios: {1}', 'espaços: {1}', 'spazi: {1}', 'espaces : {1}']],
    [/^(\d+)(\+?) results? in (\d+) files?$/, ['{1}{2} resultado(s) en {3} archivo(s)', '{1}{2} resultado(s) em {3} arquivo(s)', '{1}{2} risultato/i in {3} file', '{1}{2} résultat(s) dans {3} fichier(s)']],
    [/^open (\/.+)$/, ['abrir {1}', 'abrir {1}', 'apri {1}', 'ouvrir {1}']],
    [/^go to line (\d+)$/, ['ir a la línea {1}', 'ir para a linha {1}', 'vai alla riga {1}', 'aller à la ligne {1}']],
    [/^\.asm files and folders → (.+?)\s+·\s+\.spim project → open it$/, ['archivos .asm y carpetas → {1}   ·   proyecto .spim → abrirlo', 'arquivos .asm e pastas → {1}   ·   projeto .spim → abri-lo', 'file .asm e cartelle → {1}   ·   progetto .spim → aprirlo', 'fichiers .asm et dossiers → {1}   ·   projet .spim → l’ouvrir']],
    [/^(\d+) files? skipped \(only text files: \.asm \.s \.txt \.\.\.\)$/, ['{1} archivo(s) omitido(s) (solo archivos de texto: .asm .s .txt ...)', '{1} arquivo(s) ignorado(s) (apenas texto: .asm .s .txt ...)', '{1} file ignorato/i (solo file di testo: .asm .s .txt ...)', '{1} fichier(s) ignoré(s) (texte uniquement : .asm .s .txt ...)']],
    [/^(.+) is already open in that window$/, ['{1} ya está abierto en esa ventana', '{1} já está aberto nessa janela', '{1} è già aperto in quella finestra', '{1} est déjà ouvert dans cette fenêtre']],
    [/^a folder cannot be moved inside itself$/, ['una carpeta no se puede mover dentro de sí misma', 'uma pasta não pode ser movida para dentro de si mesma', 'una cartella non può essere spostata dentro sé stessa', 'un dossier ne peut pas être déplacé dans lui-même']],

    // ---- Confirm dialogs ----
    [/^Replace (\d+) match(?:es)? in (\d+) files? with "(.*)"\? Closed files are saved, open files stay unsaved\.$/, ['¿Reemplazar {1} coincidencia(s) en {2} archivo(s) por "{3}"? Los archivos cerrados se guardan; los abiertos quedan sin guardar.', 'Substituir {1} ocorrência(s) em {2} arquivo(s) por "{3}"? Arquivos fechados são salvos; os abertos ficam sem salvar.', 'Sostituire {1} occorrenza/e in {2} file con "{3}"? I file chiusi vengono salvati, quelli aperti restano non salvati.', 'Remplacer {1} occurrence(s) dans {2} fichier(s) par « {3} » ? Les fichiers fermés sont enregistrés, les ouverts restent non enregistrés.']],
    [/^Open the project "(.+)"\? (.+)$/, ['¿Abrir el proyecto "{1}"? El proyecto actual se reemplazará (descárgalo antes con [guardar proyecto] si lo necesitas).', 'Abrir o projeto "{1}"? O projeto atual será substituído (baixe-o antes com [salvar projeto] se precisar).', 'Aprire il progetto "{1}"? Il progetto attuale verrà sostituito (scaricalo prima con [salva progetto] se ti serve).', 'Ouvrir le projet « {1} » ? Le projet actuel sera remplacé (téléchargez-le avant avec [enregistrer le projet] si besoin).']],
    [/^Uninstall "(.+)"\? Its saved data is removed too\.$/, ['¿Desinstalar "{1}"? También se borran sus datos guardados.', 'Desinstalar "{1}"? Os dados salvos também serão removidos.', 'Disinstallare "{1}"? Verranno rimossi anche i suoi dati.', 'Désinstaller « {1} » ? Ses données seront aussi supprimées.']],
    [/^Remove the server (.+)\? Installed extensions stay installed\.$/, ['¿Eliminar el servidor {1}? Las extensiones instaladas se mantienen.', 'Remover o servidor {1}? As extensões instaladas permanecem.', 'Rimuovere il server {1}? Le estensioni installate restano.', 'Supprimer le serveur {1} ? Les extensions installées restent.']],
    [/^Restore the default settings\? Files and extensions are not touched\.$/, ['¿Restablecer los ajustes por defecto? No se tocan archivos ni extensiones.', 'Restaurar as configurações padrão? Arquivos e extensões não são alterados.', 'Ripristinare le impostazioni predefinite? File ed estensioni non vengono toccati.', 'Restaurer les paramètres par défaut ? Fichiers et extensions ne sont pas modifiés.']],
    [/^"(.+)" comes from (.+)\. Extensions run JavaScript with access to your project\. Install it only if you trust the server\.$/, ['"{1}" viene de {2}. Las extensiones ejecutan JavaScript con acceso a tu proyecto. Instálala solo si confías en el servidor.', '"{1}" vem de {2}. As extensões executam JavaScript com acesso ao seu projeto. Instale apenas se confiar no servidor.', '"{1}" proviene da {2}. Le estensioni eseguono JavaScript con accesso al progetto. Installala solo se ti fidi del server.', '« {1} » vient de {2}. Les extensions exécutent du JavaScript avec accès à votre projet. Installez-la seulement si vous faites confiance au serveur.']],
    [/^The server does not answer \((.+)\)\. Add it anyway\?$/, ['El servidor no responde ({1}). ¿Añadirlo igualmente?', 'O servidor não responde ({1}). Adicionar mesmo assim?', 'Il server non risponde ({1}). Aggiungerlo comunque?', 'Le serveur ne répond pas ({1}). L’ajouter quand même ?']],
    [/^server (.+) added \((\d+) extensions\)$/, ['servidor {1} añadido ({2} extensiones)', 'servidor {1} adicionado ({2} extensões)', 'server {1} aggiunto ({2} estensioni)', 'serveur {1} ajouté ({2} extensions)']],
    [/^that server is already in the list$/, ['ese servidor ya está en la lista', 'esse servidor já está na lista', 'quel server è già nell’elenco', 'ce serveur est déjà dans la liste']],
    [/^install failed: (.+)$/, ['falló la instalación: {1}', 'a instalação falhou: {1}', 'installazione fallita: {1}', 'échec de l’installation : {1}']],
    [/^extension (.+) failed: (.+)$/, ['la extensión {1} falló: {2}', 'a extensão {1} falhou: {2}', 'l’estensione {1} non è riuscita: {2}', 'l’extension {1} a échoué : {2}']],
    [/^copied$/, ['copiado', 'copiado', 'copiato', 'copié']],
    [/^\[(.+)\] language$/, ['[{1}] idioma', '[{1}] idioma', '[{1}] lingua', '[{1}] langue']],
    [/^pipeline: forwarding (on|off), CPI ([\d.]+)$/, ['pipeline: forwarding {t1}, CPI {2}', 'pipeline: forwarding {t1}, CPI {2}', 'pipeline: forwarding {t1}, CPI {2}', 'pipeline : forwarding {t1}, CPI {2}']],
    [/^pipeline: branches resolved in (ID|EX), CPI ([\d.]+)$/, ['pipeline: saltos resueltos en {1}, CPI {2}', 'pipeline: desvios resolvidos em {1}, CPI {2}', 'pipeline: salti risolti in {1}, CPI {2}', 'pipeline : branchements résolus en {1}, CPI {2}']],
];

// ================== //
//  Engine            //
// ================== //
interface I18nApi {
    lang: Lang;
    langs: Record<Lang, string>;
    set(lang: Lang): void;
    tr(text: string): string;
    t(key: string, params?: Record<string, unknown>): string;
}

const I18N: I18nApi = (() => {
    const read = (): Lang => {
        try {
            const st = JSON.parse(localStorage.getItem('sh-settings') || '{}');
            if (st.lang && st.lang in LANGS) return st.lang;
        } catch (e) { /* default */ }
        const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
        return (nav in LANGS ? nav : 'en') as Lang;
    };

    let lang: Lang = read();
    const lower: Record<string, Row> = {};
    Object.entries(DICT).forEach(([k, v]) => { lower[k.toLowerCase()] = v; });

    const word = (key: string): string | null => {
        if (lang === 'en') return key;
        const row = DICT[key] || lower[key.toLowerCase()];
        return row ? row[COLUMN[lang]] : null;
    };

    // Text of a node: exact, patterns, [inner], [a: b]
    const tr = (text: string): string => {
        if (lang === 'en' || !text) return text;
        const [, pre, core, post] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
        if (!core) return text;
        let out = word(core);
        if (out === null) {
            for (const [re, row] of PATTERNS) {
                const p = re.exec(core);
                if (!p) continue;
                out = row[COLUMN[lang]].replace(/\{(t?)(\d+)\}/g, (_, tt, n) => {
                    const v = p[+n] ?? '';
                    return tt ? tr(v) : v;
                });
                break;
            }
        }
        if (out === null) {
            const b = /^\[([^\[\]]+)\]$/.exec(core);
            if (b) {
                const inner = b[1];
                let w = tr(inner);
                if (w === inner && inner.includes(': ')) w = inner.split(': ').map(tr).join(': ');
                if (w !== inner) out = `[${w}]`;
            }
        }
        return out === null ? text : pre + out + post;
    };

    const t = (key: string, params: Record<string, unknown> = {}): string => {
        const res = word(key) ?? tr(key);
        return res.replace(/\{(\w+)\}/g, (all, k) => (k in params ? String(params[k]) : all));
    };

    return {
        get lang() { return lang; },
        langs: LANGS,
        set: (l: Lang) => { if (l in LANGS) lang = l; },       // the DOM translator wraps it
        tr, t,
    };
})();

const T = (key: string, params?: Record<string, unknown>) => I18N.t(key, params);

// ================== //
//  DOM translator    //
// ================== //
(() => {
    // Never translated: code, program output, registers, memory, file names, user input
    const SKIP = [
        'textarea', 'input', 'code', 'script', 'style', '.export-code', '.find-layer', '.output-log',
        '.terminal-log', '#terminal-cmd', '#text-segment', '#data-segment', '.runner-register', '.runner-coproc1',
        '.runner-coproc0', '.sr-text', '.sr-name', '.sr-dir', '.ext-readme', '.ext-desc', '.ext-name', '.md-code',
        '.explorer-main', '.file-queue', '.palette-list .muted', '.sb-file', '.spimhub-pet', '.conv', '.mix',
        '.pl-diagram tbody td:nth-child(2)', '.dp-stage-instr', '#extensions-list .ext-meta', '.runner-file', '.pipeline-file',
        '.servers .url', '.ext-meta-table td:last-child', '.stage',
    ].join(',');
    const ATTRS = ['placeholder', 'title'];

    const original = new WeakMap<Node, string>();        // text node -> english
    const shown = new WeakMap<Node, string>();           // text node -> what we wrote
    const attrOriginal = new WeakMap<Element, Record<string, string>>();
    const tracked = new Set<WeakRef<Text>>();

    const skip = (el: Element | null) => !!el && !!el.closest(SKIP);

    const text_node = (node: Text) => {
        const parent = node.parentElement;
        if (!parent || skip(parent)) return;
        // New text written by the app = new original
        if (!original.has(node) || shown.get(node) !== node.data) {
            original.set(node, node.data);
            if (typeof WeakRef !== 'undefined') tracked.add(new WeakRef(node));
        }
        const next = I18N.tr(original.get(node));
        if (next !== node.data) node.data = next;
        shown.set(node, node.data);
    };

    const attrs = (el: Element) => {
        if (skip(el) && el.tagName !== 'INPUT') return;
        ATTRS.forEach(a => {
            if (!el.hasAttribute(a)) return;
            let o = attrOriginal.get(el);
            if (!o) { o = {}; attrOriginal.set(el, o); }
            const cur = el.getAttribute(a);
            const done = (el as HTMLElement).dataset[`i18n${a}`];
            if (o[a] === undefined || cur !== done) o[a] = cur;
            const next = I18N.tr(o[a]);
            (el as HTMLElement).dataset[`i18n${a}`] = next;
            if (next !== cur) el.setAttribute(a, next);
        });
    };

    const walk = (root: Node) => {
        if (root.nodeType === Node.TEXT_NODE) { text_node(root as Text); return; }
        if (root.nodeType !== Node.ELEMENT_NODE) return;
        const el = root as Element;
        if (el.matches(SKIP) && el.tagName !== 'INPUT') return;
        attrs(el);
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode: (n) => n.nodeType === Node.ELEMENT_NODE && (n as Element).matches(SKIP) && (n as Element).tagName !== 'INPUT'
                ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
        });
        let n: Node | null;
        while ((n = tw.nextNode())) {
            if (n.nodeType === Node.TEXT_NODE) text_node(n as Text);
            else attrs(n as Element);
        }
    };

    let busy = false;
    const observer = new MutationObserver((records) => {
        if (busy || I18N.lang === 'en') return;
        busy = true;
        try {
            records.forEach(r => {
                if (r.type === 'childList') r.addedNodes.forEach(walk);
                else if (r.type === 'characterData') text_node(r.target as Text);
                else if (r.type === 'attributes') attrs(r.target as Element);
            });
        } finally {
            busy = false;
        }
    });
    const observe = () => observer.observe(document.documentElement, {
        childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS,
    });

    const TITLE = document.title || 'SpimHub - MIPS & RISC-V Assembly IDE';
    const apply = () => {
        document.documentElement.setAttribute('lang', I18N.lang);
        document.title = I18N.tr(TITLE);
        busy = true;
        try { walk(document.body || document.documentElement); } finally { busy = false; }
    };

    // Change the language without reloading
    const set_lang = I18N.set;
    I18N.set = (lang: Lang) => {
        if (!(lang in LANGS) || lang === I18N.lang) return;
        // Restore the english text of everything we translated, then translate again
        busy = true;
        try {
            tracked.forEach(ref => {
                const node = ref.deref();
                if (!node || !node.isConnected) { tracked.delete(ref); return; }
                const o = original.get(node);
                if (o !== undefined && node.data === shown.get(node)) { node.data = o; shown.set(node, o); }
            });
            document.querySelectorAll<HTMLElement>('[data-i18nplaceholder], [data-i18ntitle]').forEach(el => {
                const o = attrOriginal.get(el);
                if (!o) return;
                ATTRS.forEach(a => {
                    if (o[a] !== undefined && el.getAttribute(a) === el.dataset[`i18n${a}`]) {
                        el.setAttribute(a, o[a]);
                        el.dataset[`i18n${a}`] = o[a];
                    }
                });
            });
        } finally {
            busy = false;
        }
        set_lang(lang);
        apply();
        if (typeof HUB !== 'undefined') HUB.emit('lang', lang);
    };

    observe();
    window.addEventListener('DOMContentLoaded', apply);
    window.addEventListener('load', () => setTimeout(apply, 0));
})();
