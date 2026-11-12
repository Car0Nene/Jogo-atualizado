# Família Fighter — Batalha na Padaria

Jogo de luta arcade em HTML Canvas e JavaScript puro (sem build), com a família: Juraci, Carlos, Pedro, Daniel, Franciely e Gabi.

## Novidades da v0.5 a v0.7

- **Animações refeitas:** atlas único e limpo (`assets/fighters.png`, 300 KB) gerado a partir das folhas originais. Remove o brilho roxo atrás dos sprites, normaliza a escala e alinha cada quadro pelos pés — sem tremidas, "flutuações" ou troca de tamanho ao atacar.
- **Movimentação nova:** simulação em passo fixo (60 Hz, igual em qualquer tela/FPS), pulo com direção, empurrão sem sair da tela, câmera que acompanha a luta com parallax.
- **Combate:** hitbox/hurtbox reais (agachar desvia de socos altos, pulo desvia de rasteiras), combos encadeados, cancelamento para o especial, defesa só pela frente, dano reduzido na defesa, contador de hits, hitstop e tremor de tela.
- **Partida:** melhor de 3 rounds, 60 s por round, anúncios (ROUND / LUTEM! / K.O. / TEMPO!), vitória perfeita, pose de vitória, estatísticas no final.
- **3 cenários:** Padaria da Juju, Quintal da Família (pôr do sol) e Festa Junina (noite, fogueira animada) + aleatório.
- **Modos:** 1P × CPU (Fácil, Normal, Difícil) e **1P × 2P local** no mesmo teclado. Luta espelhada (mesmo lutador) com roupas em cores alternativas.
- **Controles:** teclado, **gamepad** e, no celular, direcional analógico + botões redondos (o botão Especial mostra a barra carregando).
- **Áudio:** efeitos sintetizados melhores e trilha chiptune por cenário (pode desligar).
- **Configurações salvas:** som, música, voz, conversa, volume, vibração e exibição dos controles de toque.
- **v0.6 — Falas:** balões de fala, conversa antes da luta, Carlos comendo bolo/pizza e sendo batizado, voz do navegador (veja abaixo).
- **v0.7 — Novos lutadores:** Pedro, Daniel, Franciely e Gabi; segundo especial (↓ + L) para todos; Juraci chama o Dadá; cenários **Bar da Simone** e **Praia do Natal**.

## Novidades da v0.8

- **Telas no estilo jogo de luta:** Lutador (grade de retratos, painel grande do 1P e do adversário com os especiais) → Cenário (cartões com prévia) → Dificuldade, rounds e tempo → tela **VS** → luta. Teclado: setas escolhem, Enter confirma, Esc volta. Toque: toque no lutador/cenário para ver, toque de novo para confirmar.
- **Personagens maiores:** câmera aproximada (cerca de 40% da altura da tela), que sobe quando alguém pula. Sprites em resolução maior e em WebP (mais nítidos).
- **Funciona em qualquer tela:** a luta se adapta de 4:3 (tablet) a 21:9 (ultrawide) sem faixas pretas; as telas de escolha têm layout para celular deitado, em pé, tablet e monitor grande.
- **Sprites "quebrados" corrigidos:** o cache offline podia misturar a tabela de sprites nova com a imagem antiga. Agora o atlas tem versão no endereço e o código é sempre buscado na rede primeiro.
- **Cenários pintados:** Bar da Simone e Praia usam a sua arte (`assets/stages`).
- **Músicas por cenário:** Padaria = "Bolo da Juraci", Quintal e Praia = música 3, Festa Junina e Bar = música 2 (configurável).
- **Voz real da Franciely:** "É isso!" (especial), "Ferrinho por ferrinho!" (combo), "Na praia a gente só desarma!" (começo da luta na Praia) e "Aí, essa tem que montar ferrinho por ferrinho!" (vitória).
- **Lista de golpes** no menu de pausa e regras de luta (1 round, melhor de 3 ou de 5; 45 s, 60 s, 99 s ou sem tempo).

### Artes de referência

`art-source/references/` guarda os pôsteres e a imagem "Selecione seu lutador". Eles **não** são usados como sprites: vários quadros têm nome ou aparência trocados (ex.: no pôster 4 a coluna "Juraci" mostra o Carlos, e Gabi/Franciely estão invertidas) e os bonequinhos são pequenos demais e diferentes dos sprites do jogo. Servem de inspiração e divulgação.
## Lutadores e especiais

`L` = especial principal (barra cheia) · `↓ + L` = segundo especial (meia barra).

| Lutador | L (barra cheia) | ↓ + L (meia barra) |
| --- | --- | --- |
| **Juraci** | Super Bolo de Cenoura (projétil que derruba) | Chama o **Dadá**: "Já vou, irmã!" — ele lava a louça e a água com sabão escorre pelo chão (pule por cima ou escorrega) |
| **Carlos** | Alterna **Gordão** (come bolo ou pizza e engorda: +força) e **Modo Fé** (é batizado: +defesa) | — |
| **Pedro** | Bebe uma **Heineken** e vira o **Monstrão** (+força, +defesa) | **Fumaça de cigarro** (o adversário tosse) |
| **Daniel** | **Modo Natal Praia**: rápido e imprevisível, dano aleatório + surpresa: bate o carro, pede uma Heineken pra esposa (ela pode deixar e ele recupera vida… ou não) ou faz um show | Dancinha com notas musicais |
| **Franciely** | Fica **irritada sem motivo**: o Carlos aparece fugindo de medo, ela ganha força e uma **fome sem fim** (vai recuperando vida) | Jato de leite |
| **Gabi** | **Super L** gigante + chuva de **brigadeiros**; no fim a **Juraci vem buscar a panela** | Canto com notas musicais |

Vitórias: o Pedro foge pro Bar da Simone, o Daniel comemora de biquíni, o Carlos ergue os braços no Modo Fé e a Juraci levanta o bolo.

## Música

A música tema **"Bolo da Juraci"** toca nos menus e, por padrão, também durante a luta (um pouco mais baixa, para os golpes e falas aparecerem). Em **Configurações → Música na luta** dá para trocar pela trilha 8-bit de cada cenário.

- Arquivos: `assets/music/bolo-da-juraci.m4a` (original, Opus) e `bolo-da-juraci.mp3` (reserva para navegadores que não tocam Opus, como Safari antigo). O jogo baixa só um dos dois.
- Os navegadores só deixam tocar som depois do primeiro toque ou tecla — a música começa aí.
- Depois de tocar uma vez, fica guardada para jogar offline.
- Para trocar a música, substitua os dois arquivos mantendo os nomes (o MP3 pode ser gerado com `ffmpeg -i musica.m4a -b:a 128k bolo-da-juraci.mp3`).

## Falas e conversas

- **Conversa antes da luta** no 1º round (balões de quadrinho; qualquer botão ou toque pula).
- **Juraci** grita "BOLO DE CENOURA!" no especial, dá bronca nos combos e comemora a vitória.
- **Carlos** no especial **Gordão** come um bolo ou uma pizza (com mordidas e farelos) e engorda; no **Modo Fé** é batizado com água e luz do céu e grita "Aleluia!".
- Frases ao derrubar, ser nocauteado e vencer.
- **Voz:** as falas podem ser lidas em voz alta pela voz do próprio navegador (pt-BR). Liga/desliga em Configurações; a qualidade depende do aparelho.

Todas as frases ficam em **`js/dialogue.js`** — dá para editar ou acrescentar sem mexer no resto do código.

## Estrutura

```
├── index.html               telas do jogo
├── manifest.webmanifest     instalação como app (PWA)
├── sw.js                    modo offline (service worker)
├── supabase-config.js       chaves públicas (preenchido no deploy)
├── css/style.css            visual de menus, seleção e controles de toque
├── js/
│   ├── game.js              motor: lutadores, IA, rounds, cenários, HUD
│   ├── dialogue.js          ✏️ FALAS DOS PERSONAGENS (edite aqui)
│   ├── audio.js             efeitos, música e voz
│   ├── account.js           conta Supabase e sincronização
│   └── sprite-data.js       gerado: tabela de quadros do atlas
├── assets/                  tudo que o jogo carrega
│   ├── sprites/fighters.png gerado: atlas dos lutadores e efeitos
│   ├── menu/                arte do menu (menu.png original + menu.webp otimizado)
│   ├── portraits/           retratos dos lutadores
│   ├── music/               músicas (.m4a original + .mp3 reserva)
│   ├── voice/               trechos da voz real da Franciely
│   ├── stages/              cenários pintados (Bar da Simone, Praia)
│   └── icons/               ícones do app
├── art-source/              artes originais (fonte do atlas; NÃO são publicadas)
│   ├── references/          pôsteres e artes de referência
│   └── audio/               áudio original da Franciely
│   └── cutouts/             recortes sem fundo gerados por tools/cutout.py
├── tools/cutout.py          remove o fundo das folhas opacas (IA local, rembg)
├── tools/build_atlas.py     gera o atlas a partir de art-source/
├── supabase/schema.sql      banco de dados (opcional)
└── .github/workflows/       publicação automática no GitHub Pages
```

### Regenerar o atlas

Se alterar as folhas de sprite originais:

```
pip install pillow numpy scipy
python tools/build_atlas.py
```

Os quadros de cada animação são definidos no topo de `tools/build_atlas.py`.

### Adicionar a folha de um lutador novo (fundo opaco)

As folhas do Pedro, Daniel, Franciely e Gabi têm cenário no fundo. Para recortá-las:

1. Salve a folha em `art-source/<lutador>-sheet.png` (ex.: `art-source/gabi-sheet.png`).
2. Confira/ajuste os retângulos de cada quadro em `CUTS` no `tools/cutout.py`.
3. Rode:

```n   pip install "rembg[cpu]" pillow numpy scipy
   python tools/cutout.py gabi
   python tools/build_atlas.py
   ```n
O `cutout.py` também gera o retrato em `assets/portraits/`. Na primeira vez ele baixa o modelo de IA (~180 MB); tudo roda no seu computador. O lutador é liberado na seleção automaticamente quando os sprites dele existem no atlas.

## Executar

Abra `index.html` no navegador. Para testar como no site publicado (service worker, instalação), sirva a pasta:

```
python -m http.server 8080
```

e acesse `http://localhost:8080`.

## Como jogar

**1 jogador (teclado):**

- Mover: `A`/`D` ou `←`/`→` · Pular: `W`, `↑` ou `Espaço` (segure uma direção para pular para o lado) · Agachar: `S`/`↓`
- Soco: `J` · Forte/Chute: `K` · Defesa: segure `I` · Especial: `L` (barra cheia) · Segundo especial: segure `↓` + `L` (meia barra)
- Pausar: `P` ou `Esc`

**2 jogadores (mesmo teclado):**

- 1P: `WASD` + `F` soco, `G` forte, `H` defesa, `T` especial
- 2P: setas + `J` soco, `K` forte, `I` defesa, `L` especial (ou `Num1`, `Num2`, `Num3`, `Num0`)

**Gamepad:** analógico/direcional move, `A` pula, `X` soco, `Y` forte, `B` especial, `LB/RB/LT/RT` defesa, `Start` pausa. No modo 2P, o segundo controle é o 2P.

**Celular:** direcional à esquerda (cima = pular, baixo = agachar) e botões à direita (segundo especial: direcional para baixo + Especial). Jogue na horizontal; ao iniciar a luta o jogo tenta entrar em tela cheia.

**Dicas:**

- Combo: `J`, `J`, `K` quando os golpes acertam. Carlos tem um 4º golpe: `K` depois do chute vira o **Combo do Chute**, que derruba.
- Com a barra cheia, apertar `L` no meio de um combo cancela direto para o especial.
- As formas (Gordão, Modo Fé, Monstrão, Natal Praia, Irritada) duram 10 s.
- Pulo e agachar: agachado você desvia de socos altos; golpes no ar acertam de cima.

## Instalar no celular (GitHub Pages)

1. Envie esta pasta para um repositório no GitHub (incluindo `.github`).
2. Em **Settings → Pages**, escolha **GitHub Actions** como fonte.
3. Faça um commit em `main` e acompanhe **Actions → Deploy Família Fighter PWA**.
4. No Android (Chrome): **Instalar app**. No iPhone (Safari): **Compartilhar → Adicionar à Tela de Início**.

O deploy publica só os arquivos necessários (~1 MB em vez de ~14 MB) e cada publicação cria uma nova versão do cache offline.

## Conta e progresso (Supabase, opcional)

1. No Supabase, abra **SQL Editor** e execute `supabase/schema.sql` (pode executar de novo em um projeto já configurado; ele atualiza as funções e permissões).
2. Em **Authentication → URL Configuration**, use a URL do GitHub Pages como **Site URL** e em **Redirect URLs**.
3. No GitHub, em **Settings → Secrets and variables → Actions → Variables**, crie `SUPABASE_URL` e `SUPABASE_ANON_KEY` (chave pública *publishable/anon*).
4. Faça outro commit em `main`. Em **Minha Conta**, crie a conta ou entre; dá para trocar o apelido depois.

Só partidas contra a CPU são registradas. Resultados de lutas sem internet ficam numa fila no aparelho e são enviados quando a conexão volta.

**Segurança:** a chave *anon* é pública por natureza — a proteção vem das políticas RLS e das funções do banco. **Nunca** coloque a chave `service_role` no jogo ou no repositório. A versão do cliente Supabase é fixa, a página tem Content-Security-Policy e o servidor limita a 300 partidas registradas por conta a cada 24 h. Como o resultado é calculado no aparelho do jogador, as estatísticas servem para diversão, não para ranking competitivo.

## Próximas etapas

- Falas gravadas pela família (com autorização) no lugar dos efeitos sintetizados.
- Empacotar para a Play Store (por exemplo, com Capacitor) se quiser um APK/AAB.
