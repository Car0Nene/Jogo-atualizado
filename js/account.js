// Conta do jogador e sincronização de resultados com o Supabase.
(() => {
  'use strict';

  // Versão fixa: evita receber automaticamente código novo/comprometido do CDN.
  const SUPABASE_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
  const QUEUE_KEY = 'ff-pending-matches';
  const MAX_QUEUE = 200;
  const VALID_OUTCOMES = new Set(['win', 'loss', 'draw']);
  const VALID_FIGHTERS = new Set(['juraci', 'carlos', 'pedro', 'daniel', 'franciely', 'gabi']);

  const $ = selector => document.querySelector(selector);
  const el = {
    dialog: $('#accountDialog'),
    status: $('#accountStatus'),
    progress: $('#accountProgress'),
    form: $('#accountForm'),
    nicknameForm: $('#nicknameForm'),
    profileNickname: $('#profileNickname'),
    nickname: $('#accountNickname'),
    email: $('#accountEmail'),
    password: $('#accountPassword'),
    signIn: $('#signInButton'),
    signUp: $('#signUpButton'),
    signOut: $('#signOutButton'),
    close: $('#closeAccountDialog'),
    button: $('#accountButton'),
    sync: $('#syncStatus')
  };

  let clientPromise = null;
  let currentUser = null;
  let returnFocus = null;
  let flushing = false;
  let authListener = null;

  const fighterName = id => (VALID_FIGHTERS.has(id) ? id.toUpperCase() : 'JURACI');

  function configured() {
    const config = window.FF_SUPABASE_CONFIG;
    return Boolean(config && typeof config.url === 'string' && /^https:\/\//.test(config.url) && config.anonKey);
  }

  async function client() {
    if (!configured()) {
      throw new Error('O projeto ainda não foi conectado ao Supabase. Configure SUPABASE_URL e SUPABASE_ANON_KEY no GitHub.');
    }
    if (!clientPromise) {
      clientPromise = import(SUPABASE_URL)
        .then(({ createClient }) => createClient(window.FF_SUPABASE_CONFIG.url, window.FF_SUPABASE_CONFIG.anonKey, {
          auth: { persistSession: true, autoRefreshToken: true }
        }))
        .catch(error => {
          clientPromise = null;
          throw error;
        });
    }
    return clientPromise;
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  function busy(isBusy) {
    for (const button of [el.signIn, el.signUp, el.signOut, $('#saveNickname')]) button.disabled = isBusy;
  }

  function setUser(user) {
    currentUser = user;
    const signedIn = Boolean(user);
    el.form.hidden = signedIn || !configured();
    el.nicknameForm.hidden = !signedIn;
    el.signOut.hidden = !signedIn;
    el.progress.hidden = !signedIn;
    el.button.textContent = signedIn ? '👤 CONTA ✓' : '👤 MINHA CONTA';
  }

  async function loadProgress(user) {
    const supabase = await client();
    const { data, error } = await supabase
      .from('family_fighter_profiles')
      .select('nickname, selected_fighter, matches_played, wins, losses, draws')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('O perfil não foi criado. Verifique se supabase/schema.sql foi executado no projeto Supabase.');
    const rate = data.matches_played ? Math.round((data.wins / data.matches_played) * 100) : 0;
    el.progress.textContent =
      `${data.nickname} · Lutador favorito: ${fighterName(data.selected_fighter)}\n` +
      `Lutas: ${data.matches_played} · Vitórias: ${data.wins} · Derrotas: ${data.losses} · Empates: ${data.draws}\n` +
      `Aproveitamento: ${rate}%`;
    if (document.activeElement !== el.profileNickname) el.profileNickname.value = data.nickname;
  }

  async function open() {
    returnFocus = document.activeElement;
    el.dialog.hidden = false;
    el.close.focus();
    if (!configured()) {
      setUser(null);
      el.status.textContent = 'A conta ainda não foi conectada. Configure a URL e a chave pública do Supabase nas variáveis do GitHub e publique novamente. O jogo funciona normalmente sem conta.';
      return;
    }
    if (!navigator.onLine) {
      el.status.textContent = 'Sem internet. A conta fica disponível quando a conexão voltar.';
      return;
    }
    el.status.textContent = 'Conectando à conta…';
    try {
      const supabase = await client();
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      setUser(data.session?.user || null);
      if (currentUser) {
        await loadProgress(currentUser);
        el.status.textContent = `Conectado como ${currentUser.email}.`;
      } else {
        el.status.textContent = 'Entre ou crie uma conta para guardar seu progresso entre aparelhos.';
      }
    } catch (error) {
      setUser(null);
      el.status.textContent = `Não foi possível conectar: ${friendly(error)}`;
      console.error('Falha ao carregar a conta.', error);
    }
  }

  function close() {
    el.dialog.hidden = true;
    if (returnFocus instanceof HTMLElement) returnFocus.focus();
  }

  function friendly(error) {
    const message = String(error?.message || error || 'erro desconhecido');
    if (/invalid login credentials/i.test(message)) return 'e-mail ou senha incorretos.';
    if (/email not confirmed/i.test(message)) return 'confirme o e-mail antes de entrar.';
    if (/already registered/i.test(message)) return 'este e-mail já tem conta. Use ENTRAR.';
    if (/failed to fetch|network/i.test(message)) return 'falha de rede. Verifique a internet.';
    return message.slice(0, 200);
  }

  async function signIn(event) {
    event.preventDefault();
    if (!el.form.reportValidity()) return;
    el.status.textContent = 'Entrando…';
    busy(true);
    try {
      const supabase = await client();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: el.email.value.trim(),
        password: el.password.value
      });
      if (error) throw error;
      el.password.value = '';
      setUser(data.user);
      await loadProgress(data.user);
      el.status.textContent = `Conectado como ${data.user.email}.`;
      await flush();
    } catch (error) {
      el.status.textContent = `Não foi possível entrar: ${friendly(error)}`;
    } finally {
      busy(false);
    }
  }

  async function signUp() {
    if (!el.email.reportValidity() || !el.password.reportValidity()) return;
    el.status.textContent = 'Criando conta…';
    busy(true);
    try {
      const supabase = await client();
      const email = el.email.value.trim();
      const nickname = el.nickname.value.trim().slice(0, 32) || email.split('@')[0].slice(0, 32);
      const { data, error } = await supabase.auth.signUp({
        email,
        password: el.password.value,
        options: {
          data: { nickname },
          emailRedirectTo: location.protocol.startsWith('http') ? location.origin + location.pathname : undefined
        }
      });
      if (error) throw error;
      el.password.value = '';
      if (!data.session || !data.user) {
        el.status.textContent = 'Conta criada! Confirme o e-mail que enviamos e depois toque em ENTRAR.';
        return;
      }
      setUser(data.user);
      await loadProgress(data.user);
      el.status.textContent = `Conta criada e conectada como ${data.user.email}.`;
    } catch (error) {
      el.status.textContent = `Não foi possível criar a conta: ${friendly(error)}`;
    } finally {
      busy(false);
    }
  }

  async function saveNickname(event) {
    event.preventDefault();
    const nickname = el.profileNickname.value.trim();
    if (!nickname || nickname.length > 32) return;
    busy(true);
    try {
      const supabase = await client();
      const { error } = await supabase.rpc('set_family_fighter_nickname', { p_nickname: nickname });
      if (error) throw error;
      await loadProgress(currentUser);
      el.status.textContent = 'Apelido atualizado.';
    } catch (error) {
      el.status.textContent = `Não foi possível salvar o apelido: ${friendly(error)}`;
    } finally {
      busy(false);
    }
  }

  async function signOut() {
    busy(true);
    try {
      const supabase = await client();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      el.progress.textContent = '';
      el.status.textContent = 'Você saiu da conta. O jogo continua disponível neste aparelho.';
    } catch (error) {
      el.status.textContent = `Não foi possível sair: ${friendly(error)}`;
    } finally {
      busy(false);
    }
  }

  // ---------- Fila local de partidas ----------
  function readQueue() {
    try {
      const stored = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      if (!Array.isArray(stored)) return [];
      // valida o conteúdo: dados do localStorage podem ter sido alterados
      return stored.filter(m => m && typeof m.matchId === 'string' && typeof m.userId === 'string'
        && VALID_OUTCOMES.has(m.outcome) && VALID_FIGHTERS.has(m.fighterId));
    } catch {
      return [];
    }
  }

  function writeQueue(queue) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
    } catch (error) {
      console.warn('Não foi possível gravar a fila local.', error);
    }
  }

  async function send(match) {
    const supabase = await client();
    const { error } = await supabase.rpc('record_family_fighter_match', {
      p_match_id: match.matchId,
      p_outcome: match.outcome,
      p_selected_fighter: match.fighterId
    });
    if (error) throw error;
  }

  async function flush() {
    if (!navigator.onLine || !currentUser || flushing) return;
    flushing = true;
    try {
      let queue = readQueue();
      const mine = queue.filter(m => m.userId === currentUser.id);
      if (!mine.length) return;
      for (const match of mine) {
        await send(match);
        queue = readQueue().filter(m => m.matchId !== match.matchId);
        writeQueue(queue);
      }
      el.sync.textContent = 'Partidas pendentes sincronizadas.';
      if (!el.dialog.hidden) await loadProgress(currentUser);
    } catch (error) {
      el.sync.textContent = `Partidas pendentes serão enviadas depois: ${friendly(error)}`;
    } finally {
      flushing = false;
    }
  }

  async function recordMatch(outcome, fighterId) {
    if (!configured() || !VALID_OUTCOMES.has(outcome) || !VALID_FIGHTERS.has(fighterId)) return;
    if (!currentUser) {
      el.sync.textContent = 'Entre em Minha Conta para guardar seu histórico de lutas.';
      return;
    }
    const match = { matchId: uuid(), userId: currentUser.id, outcome, fighterId };
    writeQueue([...readQueue(), match]);
    if (!navigator.onLine) {
      el.sync.textContent = 'Sem internet: o resultado será enviado quando a conexão voltar.';
      return;
    }
    el.sync.textContent = 'Salvando resultado…';
    try {
      const supabase = await client();
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (data.session?.user?.id !== match.userId) {
        el.sync.textContent = 'Sessão expirada: entre novamente para enviar o resultado.';
        return;
      }
      await send(match);
      writeQueue(readQueue().filter(m => m.matchId !== match.matchId));
      el.sync.textContent = 'Resultado salvo na sua conta ✓';
      await flush();
    } catch (error) {
      el.sync.textContent = `Resultado guardado neste aparelho para enviar depois (${friendly(error)}).`;
    }
  }

  async function restore() {
    if (!navigator.onLine || !configured()) return;
    try {
      const supabase = await client();
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      setUser(data.session?.user || null);
      if (!authListener) {
        authListener = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
      }
      await flush();
    } catch (error) {
      console.warn('A conta será reconectada ao abrir Minha Conta.', error);
    }
  }

  el.button.addEventListener('click', () => void open());
  el.close.addEventListener('click', close);
  el.form.addEventListener('submit', event => void signIn(event));
  el.signUp.addEventListener('click', () => void signUp());
  el.signOut.addEventListener('click', () => void signOut());
  el.nicknameForm.addEventListener('submit', event => void saveNickname(event));
  window.addEventListener('online', () => void restore());

  setUser(null);
  void restore();

  window.FFAccount = { open, close, recordMatch, isOpen: () => !el.dialog.hidden };
})();
