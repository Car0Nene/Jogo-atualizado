// =====================================================================
// FALAS DOS PERSONAGENS — edite à vontade!
// ---------------------------------------------------------------------
// • Cada lista tem várias opções; o jogo sorteia uma.
// • {oponente} é trocado pelo nome do adversário (ex.: "Carlos").
// • Mantenha as frases curtas (até ~45 letras) para caber no balão.
// • Para acrescentar uma frase, copie uma linha, troque o texto e
//   não esqueça a vírgula no final.
// =====================================================================
window.FF_DIALOGUE = {
  // Conversa antes do 1º round. "p1" = quem está à esquerda, "p2" = à direita.
  // A chave é "lutadorDaEsquerda>lutadorDaDireita".
  intro: {
    'juraci>carlos': [
      [['p1', 'Carlos! Saiu da dieta de novo?'], ['p2', 'Vó, é só um pedacinho de bolo...'], ['p1', 'Então vai ter que merecer!']],
      [['p1', 'Quem mexeu no meu bolo de cenoura?'], ['p2', 'Eu não fui... foi o Pedro!'], ['p1', 'Tá com cobertura no bigode, menino!']],
      [['p2', 'Vó, hoje eu tô inspirado!'], ['p1', 'Inspirado tá meu bolo no forno.'], ['p1', 'Vem que eu te ensino!']]
    ],
    'carlos>juraci': [
      [['p1', 'Vó, cadê aquele bolo de cenoura?'], ['p2', 'Só depois de lavar a louça!'], ['p1', 'Então vamos resolver na luta!']],
      [['p1', 'Hoje a padaria é minha, vó!'], ['p2', 'Ah é? Vem buscar, meu filho!']],
      [['p2', 'Comeu a pizza toda sozinho, Carlos?'], ['p1', 'Sobrou a borda... pra você!'], ['p2', 'Ah, agora vai apanhar!']]
    ],
    'juraci>juraci': [
      [['p1', 'Ué! Quem é essa aí?'], ['p2', 'Eu sou a Juraci original!'], ['p1', 'Original é meu bolo de cenoura!']]
    ],
    'carlos>carlos': [
      [['p1', 'Ei, você roubou minha roupa?'], ['p2', 'Fica melhor em mim!'], ['p1', 'Só se for na luta!']]
    ],
    'juraci>pedro': [
      [['p1', 'Pedro, apaga esse cigarro na minha padaria!'], ['p2', 'Só mais uma tragada, vó...'], ['p1', 'Vai é levar bolada!']]
    ],
    'pedro>juraci': [
      [['p1', 'Vó, a senhora viu minha Heineken?'], ['p2', 'Joguei fora, Pedro!'], ['p1', 'Aí a senhora pegou pesado!']]
    ],
    'carlos>pedro': [
      [['p1', 'Pedro, de novo indo pro Bar da Simone?'], ['p2', 'Depois que eu te derrubar, gato!']]
    ],
    'pedro>carlos': [
      [['p1', 'Carlos, me paga uma Heineken?'], ['p2', 'Só se ganhar de mim!'], ['p1', 'Então já pode ir abrindo!']]
    ],
    'juraci>daniel': [
      [['p1', 'Daniel, vai lutar de biquíni?'], ['p2', 'Partiu praia, vó!'], ['p1', 'Partiu é levar bolo!']]
    ],
    'daniel>juraci': [
      [['p1', 'Vó, bora pra praia comigo?'], ['p2', 'Só depois da louça, Daniel!']]
    ],
    'daniel>pedro': [
      [['p1', 'Pedro, depois a gente vai pro bar?'], ['p2', 'Se a sua esposa deixar...'], ['p1', 'Ixi... ela não vai deixar.']]
    ],
    'pedro>daniel': [
      [['p1', 'Daniel, cadê a sua esposa?'], ['p2', 'Tá em casa... psiu!'], ['p1', 'Vou contar tudo pra ela!']]
    ],
    'franciely>carlos': [
      [['p1', 'CARLOS!'], ['p2', 'Eu não fiz nada, amor!'], ['p1', 'Ainda! Mas vai fazer!']],
      [['p1', 'Quem comeu o último pedaço de pizza?'], ['p2', 'Foi o Mateus?'], ['p1', 'O Mateus é um bebê, Carlos!']]
    ],
    'carlos>franciely': [
      [['p1', 'Amor, calma, vamos conversar...'], ['p2', 'Conversar? Tô com FOME!']]
    ],
    'gabi>juraci': [
      [['p1', 'Vó, trouxe brigadeiro pra senhora!'], ['p2', 'Ai, que menina boa!'], ['p1', 'Mas antes... vamos lutar!']]
    ],
    'juraci>gabi': [
      [['p1', 'Gabi, cadê meus brigadeiros?'], ['p2', 'Tão no fogo, vó! Ganhando eu entrego!']]
    ],
    'gabi>franciely': [
      [['p1', 'Fran, quer um brigadeiro?'], ['p2', 'Quero TODOS!']]
    ],
    // Usada quando não existe conversa específica para a dupla.
    '*': [
      [['p1', 'Família é tudo, {oponente}...'], ['p2', '...mas hoje eu vou ganhar!']],
      [['p2', 'Tá pronto(a), {oponente}?'], ['p1', 'Nasci pronto(a)!']],
      [['p1', 'Depois da luta tem bolo da vó!'], ['p2', 'Então vamos logo!']]
    ]
  },

  juraci: {
    special: ['BOLO DE CENOURA!', 'Toma bolo quentinho!', 'Com cobertura de chocolate!', 'Saiu do forno agora!'],
    combo: ['Respeita a vó!', 'Isso é pra aprender!', 'Olha a educação!', 'Tá pensando que é bagunça?'],
    knockdown: ['Ai, minha coluna!', 'Isso não se faz com a vó!'],
    win: ['Quem manda nesta cozinha sou eu!', 'Agora vai lavar a louça!', 'Vem comer bolo, vem!', 'Família é tudo, mas a vó é mais!'],
    lose: ['Ai, ai... me ajuda a levantar!', 'Vou contar pra sua mãe!'],
    formEnd: [],
    // Segundo especial (↓ + L): chama o Dadá para lavar a louça
    dada: ['DADÁÁÁ! Vem lavar essa louça!', 'Dadá! A louça tá esperando!', 'DADÁ! Cadê você?'],
    brigadeiro: ['Brigadeiro! Obrigada, Gabi!', 'Ai, que delícia, minha filha!']
  },

  // O Dadá aparece quando a Juraci chama.
  dada: {
    reply: ['Já vou, irmã!'],
    wash: ['Cuidado que o chão tá molhado!', 'Louça lavada, irmã!']
  },

  carlos: {
    special: ['COMBO DO CHUTE!'],
    combo: ['Tá vendo, vó?', 'Esse é o tal do combo!', 'Treinei no quintal!'],
    knockdown: ['Tô vendo estrelas...', 'Ai! Essa doeu!'],
    win: ['Família é tudo... mas a vitória é minha!', 'Depois dessa, mereço uma pizza!', 'Foi mal, vó! Te amo!'],
    lose: ['Tô vendo estrelas...', 'Só mais um pedaço de bolo e eu volto...'],
    // Transformação Gordão: primeiro anuncia a comida, depois mastiga, depois engorda.
    eatCake: ['Hmm... bolo da vó!', 'Olha esse bolo de cenoura!'],
    eatPizza: ['Hmm... pizza de calabresa!', 'Só uma fatia de pizza...'],
    chew: ['NHAC! NHAC! NHAC!', 'Nham nham nham!'],
    fat: ['GORDÃÃÃO!', 'A camisa ficou apertada!', 'Agora eu tô pesado!'],
    // Transformação Modo Fé: batismo com água e luz.
    baptize: ['Senhor, me dá força!', 'Hoje eu me batizo!'],
    blessed: ['Batizado e abençoado! ALELUIA!', 'Aleluia! Tô blindado!', 'Glória! Agora ninguém me derruba!'],
    formEnd: ['Ufa, voltou o tanquinho!', 'Passou o efeito...'],
    // Quando a Franciely fica brava e ele sai correndo
    flee: ['SOCORRO! Ela tá brava!', 'Amor, eu não fiz nada!', 'Tô fora!']
  },

  pedro: {
    smoke: ['Quer uma tragada?', 'Toma fumaça!', 'Respira isso, amor!'],
    drink: ['Hora da Heineken!', 'Só uma geladinha...'],
    gulp: ['Glub glub glub!'],
    hulk: ['MONSTRÃÃÃO!', 'Agora sim, tô forte!', 'Heineken dá força!'],
    combo: ['Fuma, bebe e vence!', 'Arrasei!', 'Sente o salto!'],
    knockdown: ['Ai, meu salto!', 'Quebrou a unha!'],
    win: ['Fui pro Bar da Simone!', 'Fuma, bebe e vence!', 'Simone, desce uma gelada!'],
    lose: ['Me leva pro bar...', 'Preciso de uma Heineken...'],
    formEnd: ['Acabou a cerveja...', 'Simone, mais uma!']
  },

  daniel: {
    praia: ['Partiu praia?', 'Modo Natal Praia ativado!', 'Ho ho ho, partiu praia!'],
    car: ['Ih, bati o carro!', 'Sai da frente que eu tô sem freio!', 'Opa, foi mal!'],
    askWife: ['Amor, posso tomar uma Heineken?', 'Amor... só uma geladinha?'],
    // respostas da esposa (aparecem no alto da tela)
    wifeYes: ['Pode, amor! Só uma!', 'Tá bom, mas só hoje!'],
    wifeNo: ['NÃO!', 'Nem pensar, Daniel!', 'Volta já pra casa!'],
    drinkOk: ['Te amo, amor!', 'Ahhh, que geladinha!'],
    drinkNo: ['Tá bom, amor...', 'Ela não deixou...'],
    sing: ['Solta o som!', 'Lá-lá-lá-lá!', 'Canta comigo!'],
    dance: ['Olha a dancinha!', 'Bora dançar!'],
    combo: ['Partiu praia?', 'Isso é treino de praia!', 'Que imprevisível!'],
    knockdown: ['Ai, minha tattoo!', 'Caí na areia!'],
    win: ['Partiu praia!', 'Vitória de biquíni!', 'Ho ho ho!'],
    lose: ['Me leva pra praia...', 'Amor, me socorre!'],
    formEnd: ['Acabou o verão...', 'Voltei pro trabalho...']
  },

  franciely: {
    angry: ['CARLOS!', 'Tô irritada e nem sei por quê!', 'NÃO FALA COMIGO!'],
    hungry: ['Tô com fome!', 'Cadê a comida?!', 'Fome sem fim!', 'Alguém trouxe lanche?'],
    milk: ['Hora do mamá!', 'Leitinho!', 'Cuidar também é lutar!'],
    combo: ['Cuidar também é lutar!', 'Mãe não brinca!', 'Puerpério não é fácil!'],
    knockdown: ['Ai! Acordou o Mateus!', 'Shhh! O bebê tá dormindo!'],
    win: ['Cuidar também é lutar!', 'Agora vou dar de mama pro Mateus!', 'Mãe sempre vence!'],
    lose: ['Só preciso de um cochilo...', 'Carlos, pega o Mateus!'],
    formEnd: ['Passou a raiva... cadê o lanche?', 'Tá bom, desculpa, amor.']
  },

  gabi: {
    superL: ['FAZ O L!', 'Super L!', 'L de Lula!'],
    brigadeiro: ['Brigadeiro pra Juraci!', 'Tá saindo brigadeiro!', 'Feito com carinho!'],
    sing: ['Canta comigo!', 'Lá-lá-lá!'],
    combo: ['Com carinho, mas com força!', 'Porque amor também é luta!', 'A luta continua!'],
    knockdown: ['Ai! Vinícius, me ajuda!', 'Ainda não acabou!'],
    win: ['Faz o L!', 'Porque amor também é luta!', 'Vinícius, eu venci!'],
    lose: ['Vinícius... me leva pra casa.', 'Amanhã tem mais luta!'],
    formEnd: []
  }
};
