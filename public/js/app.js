/**
 * Main VoIP Application — Ties together UI, Socket.IO signaling, and WebRTC
 */
(function () {
  // ═══════════════════════════════════════
  //  STATE
  // ═══════════════════════════════════════
  const state = {
    socket: null,
    myUsername: '',
    mySocketId: '',
    currentCallPeer: null,   // { socketId, username }
    callState: 'idle',       // idle | outgoing | incoming | active
    callTimer: null,
    callSeconds: 0,
    isMuted: false,
    isVideoOn: false
  };

  // ═══════════════════════════════════════
  //  DOM ELEMENTS
  // ═══════════════════════════════════════
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    // Screens
    loginScreen: $('#login-screen'),
    appScreen: $('#app-screen'),

    // Login
    usernameInput: $('#username-input'),
    joinBtn: $('#join-btn'),
    loginError: $('#login-error'),

    // Sidebar
    myAvatar: $('#my-avatar'),
    myUsername: $('#my-username'),
    onlineCount: $('#online-count'),
    userList: $('#user-list'),
    logoutBtn: $('#logout-btn'),

    // Call States
    idleState: $('#idle-state'),
    incomingState: $('#incoming-state'),
    outgoingState: $('#outgoing-state'),
    activeState: $('#active-state'),

    // Incoming
    callerAvatar: $('#caller-avatar'),
    callerName: $('#caller-name'),
    acceptBtn: $('#accept-btn'),
    rejectBtn: $('#reject-btn'),

    // Outgoing
    calleeAvatar: $('#callee-avatar'),
    calleeName: $('#callee-name'),
    cancelCallBtn: $('#cancel-call-btn'),

    // Active
    activeAvatar: $('#active-avatar'),
    activeName: $('#active-name'),
    callTimer: $('#call-timer'),
    voiceCallDisplay: $('#voice-call-display'),
    videoContainer: $('#video-container'),
    remoteVideo: $('#remote-video'),
    localVideo: $('#local-video'),

    // Controls
    muteBtn: $('#mute-btn'),
    videoToggleBtn: $('#video-toggle-btn'),
    speakerBtn: $('#speaker-btn'),
    hangupBtn: $('#hangup-btn'),

    // Toast
    toastContainer: $('#toast-container')
  };

  // ═══════════════════════════════════════
  //  UTILITIES
  // ═══════════════════════════════════════

  /** Generate a color from username */
  function getAvatarColor(name) {
    const colors = [
      'linear-gradient(135deg, #6c5ce7, #a29bfe)',
      'linear-gradient(135deg, #00d2a0, #00b894)',
      'linear-gradient(135deg, #fd79a8, #e84393)',
      'linear-gradient(135deg, #fdcb6e, #f39c12)',
      'linear-gradient(135deg, #74b9ff, #0984e3)',
      'linear-gradient(135deg, #ff7675, #d63031)',
      'linear-gradient(135deg, #55efc4, #00cec9)',
      'linear-gradient(135deg, #fab1a0, #e17055)',
      'linear-gradient(135deg, #81ecec, #00b894)',
      'linear-gradient(135deg, #dfe6e9, #b2bec3)'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  /** Set avatar with initial letter and color */
  function setAvatar(element, username) {
    element.textContent = username.charAt(0).toUpperCase();
    element.style.background = getAvatarColor(username);
  }

  /** Show toast notification */
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    els.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /** Switch between call states */
  function setCallState(newState) {
    state.callState = newState;
    [els.idleState, els.incomingState, els.outgoingState, els.activeState].forEach(el => {
      el.classList.remove('active');
    });

    switch (newState) {
      case 'idle':
        els.idleState.classList.add('active');
        break;
      case 'incoming':
        els.incomingState.classList.add('active');
        break;
      case 'outgoing':
        els.outgoingState.classList.add('active');
        break;
      case 'active':
        els.activeState.classList.add('active');
        break;
    }
  }

  /** Format seconds to MM:SS */
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  /** Start call timer */
  function startCallTimer() {
    state.callSeconds = 0;
    els.callTimer.textContent = '00:00';
    state.callTimer = setInterval(() => {
      state.callSeconds++;
      els.callTimer.textContent = formatTime(state.callSeconds);
    }, 1000);
  }

  /** Stop call timer */
  function stopCallTimer() {
    if (state.callTimer) {
      clearInterval(state.callTimer);
      state.callTimer = null;
    }
  }

  // ═══════════════════════════════════════
  //  SCREEN SWITCHING
  // ═══════════════════════════════════════

  function showScreen(screenId) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $(`#${screenId}`).classList.add('active');
  }

  // ═══════════════════════════════════════
  //  SOCKET.IO — SIGNALING
  // ═══════════════════════════════════════

  function connectSocket() {
    state.socket = io();

    state.socket.on('connect', () => {
      console.log('[Socket] Connected:', state.socket.id);
    });

    // Registration confirmed
    state.socket.on('registered', ({ username, socketId }) => {
      state.myUsername = username;
      state.mySocketId = socketId;

      // Update UI
      setAvatar(els.myAvatar, username);
      els.myUsername.textContent = username;

      showScreen('app-screen');
      showToast(`Selamat datang, ${username}! 🎉`, 'success');
    });

    // Registration error
    state.socket.on('register-error', (msg) => {
      els.loginError.textContent = msg;
      els.joinBtn.disabled = false;
      els.joinBtn.querySelector('span').textContent = 'Masuk';
    });

    // Updated user list
    state.socket.on('user-list', (users) => {
      renderUserList(users);
    });

    // ─── Incoming Call ───
    state.socket.on('incoming-call', ({ from, callerName }) => {
      if (state.callState !== 'idle') {
        // Already in a call, auto-reject
        state.socket.emit('call-rejected', { to: from });
        return;
      }

      state.currentCallPeer = { socketId: from, username: callerName };
      setAvatar(els.callerAvatar, callerName);
      els.callerName.textContent = callerName;
      setCallState('incoming');
      window.audioManager.startRingtone();
      showToast(`📞 Panggilan masuk dari ${callerName}`, 'info');
    });

    // ─── Call Accepted ───
    state.socket.on('call-accepted', async ({ from, calleeName }) => {
      window.audioManager.stopRingtone();
      window.audioManager.playConnected();

      state.currentCallPeer = { socketId: from, username: calleeName };

      // Start WebRTC as caller (create offer)
      try {
        await window.webrtcManager.getLocalStream(false);
        setupWebRTCCallbacks();
        window.webrtcManager.createPeerConnection();
        const offer = await window.webrtcManager.createOffer();
        state.socket.emit('offer', { to: from, offer });
      } catch (err) {
        showToast('Gagal mengakses microphone!', 'error');
        endCall();
        return;
      }

      setAvatar(els.activeAvatar, calleeName);
      els.activeName.textContent = calleeName;
      setCallState('active');
      startCallTimer();
      showToast(`✅ ${calleeName} mengangkat panggilan`, 'success');
    });

    // ─── Call Rejected ───
    state.socket.on('call-rejected', () => {
      window.audioManager.stopRingtone();
      window.audioManager.playDisconnected();
      showToast('❌ Panggilan ditolak', 'error');
      resetCallState();
    });

    // ─── Call Ended ───
    state.socket.on('call-ended', () => {
      window.audioManager.stopRingtone();
      window.audioManager.playDisconnected();
      showToast('📴 Panggilan berakhir', 'info');
      endCall();
    });

    // ─── User Disconnected ───
    state.socket.on('user-disconnected', (socketId) => {
      if (state.currentCallPeer && state.currentCallPeer.socketId === socketId) {
        window.audioManager.stopRingtone();
        window.audioManager.playDisconnected();
        showToast('📴 User terputus', 'error');
        endCall();
      }
    });

    // ─── WebRTC Signaling: Offer ───
    state.socket.on('offer', async ({ from, offer }) => {
      try {
        await window.webrtcManager.getLocalStream(false);
        setupWebRTCCallbacks();
        window.webrtcManager.createPeerConnection();
        const answer = await window.webrtcManager.createAnswer(offer);
        state.socket.emit('answer', { to: from, answer });
      } catch (err) {
        console.error('[App] Error handling offer:', err);
        showToast('Gagal memproses panggilan', 'error');
      }
    });

    // ─── WebRTC Signaling: Answer ───
    state.socket.on('answer', async ({ from, answer }) => {
      try {
        await window.webrtcManager.setRemoteAnswer(answer);
      } catch (err) {
        console.error('[App] Error handling answer:', err);
      }
    });

    // ─── WebRTC Signaling: ICE Candidate ───
    state.socket.on('ice-candidate', async ({ from, candidate }) => {
      try {
        await window.webrtcManager.addIceCandidate(candidate);
      } catch (err) {
        console.error('[App] Error adding ICE candidate:', err);
      }
    });
  }

  // ═══════════════════════════════════════
  //  WEBRTC CALLBACKS
  // ═══════════════════════════════════════

  function setupWebRTCCallbacks() {
    window.webrtcManager.onIceCandidate = (candidate) => {
      if (state.currentCallPeer) {
        state.socket.emit('ice-candidate', {
          to: state.currentCallPeer.socketId,
          candidate
        });
      }
    };

    window.webrtcManager.onRemoteStream = (stream) => {
      els.remoteVideo.srcObject = stream;

      // Check if there's video
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0 && videoTracks[0].enabled) {
        els.videoContainer.style.display = 'block';
        els.voiceCallDisplay.style.display = 'none';
      }
    };

    window.webrtcManager.onConnectionStateChange = (connState) => {
      if (connState === 'disconnected' || connState === 'failed') {
        showToast('Koneksi terputus...', 'error');
        endCall();
      }
    };
  }

  // ═══════════════════════════════════════
  //  RENDER USER LIST
  // ═══════════════════════════════════════

  function renderUserList(users) {
    // Filter out self
    const otherUsers = users.filter(u => u.socketId !== state.mySocketId);
    els.onlineCount.textContent = otherUsers.length;

    if (otherUsers.length === 0) {
      els.userList.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 15h8M9 9h.01M15 9h.01"/>
          </svg>
          <p>Belum ada user lain online</p>
          <span>Buka tab browser baru untuk testing</span>
        </div>
      `;
      return;
    }

    els.userList.innerHTML = otherUsers.map(user => `
      <div class="user-item" data-socket-id="${user.socketId}" data-username="${user.username}">
        <div class="user-item-info">
          <div class="avatar" style="background: ${getAvatarColor(user.username)}">${user.username.charAt(0).toUpperCase()}</div>
          <div>
            <div class="user-item-name">${user.username}</div>
            <div class="user-item-status">Online</div>
          </div>
        </div>
        <button class="call-user-btn" title="Telepon ${user.username}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
          </svg>
        </button>
      </div>
    `).join('');

    // Attach click handlers
    $$('.call-user-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.user-item');
        const socketId = item.dataset.socketId;
        const username = item.dataset.username;
        initiateCall(socketId, username);
      });
    });

    // Also allow clicking on the user item itself
    $$('.user-item').forEach(item => {
      item.addEventListener('click', () => {
        const socketId = item.dataset.socketId;
        const username = item.dataset.username;
        initiateCall(socketId, username);
      });
    });
  }

  // ═══════════════════════════════════════
  //  CALL ACTIONS
  // ═══════════════════════════════════════

  /** Initiate a call to another user */
  function initiateCall(socketId, username) {
    if (state.callState !== 'idle') {
      showToast('Kamu sedang dalam panggilan', 'error');
      return;
    }

    state.currentCallPeer = { socketId, username };
    state.socket.emit('call-request', { to: socketId, callerName: state.myUsername });

    setAvatar(els.calleeAvatar, username);
    els.calleeName.textContent = username;
    setCallState('outgoing');
    window.audioManager.startDialTone();
    showToast(`📞 Memanggil ${username}...`, 'info');
  }

  /** Accept incoming call */
  async function acceptCall() {
    if (!state.currentCallPeer) return;

    window.audioManager.stopRingtone();
    window.audioManager.playConnected();

    // Notify caller that we accepted
    state.socket.emit('call-accepted', { to: state.currentCallPeer.socketId });

    // Setup for WebRTC (callee waits for offer)
    setAvatar(els.activeAvatar, state.currentCallPeer.username);
    els.activeName.textContent = state.currentCallPeer.username;
    setCallState('active');
    startCallTimer();
  }

  /** Reject incoming call */
  function rejectCall() {
    if (!state.currentCallPeer) return;

    window.audioManager.stopRingtone();
    state.socket.emit('call-rejected', { to: state.currentCallPeer.socketId });
    resetCallState();
  }

  /** End active or outgoing call */
  function endCall() {
    window.audioManager.stopRingtone();
    stopCallTimer();

    if (state.currentCallPeer) {
      state.socket.emit('call-ended', { to: state.currentCallPeer.socketId });
    }

    // Cleanup WebRTC
    window.webrtcManager.cleanup();

    // Reset video elements
    els.remoteVideo.srcObject = null;
    els.localVideo.srcObject = null;
    els.videoContainer.style.display = 'none';
    els.voiceCallDisplay.style.display = '';

    resetCallState();
  }

  /** Reset to idle */
  function resetCallState() {
    state.currentCallPeer = null;
    state.isMuted = false;
    state.isVideoOn = false;
    stopCallTimer();
    setCallState('idle');
    updateMuteUI();
    updateVideoUI();
  }

  // ═══════════════════════════════════════
  //  CONTROL TOGGLES
  // ═══════════════════════════════════════

  function toggleMute() {
    const isAudioOn = window.webrtcManager.toggleMute();
    state.isMuted = !isAudioOn;
    updateMuteUI();
    showToast(state.isMuted ? '🔇 Microphone dimatikan' : '🎤 Microphone dinyalakan', 'info');
  }

  function updateMuteUI() {
    const muteBtn = els.muteBtn;
    const iconUnmuted = muteBtn.querySelector('.icon-unmuted');
    const iconMuted = muteBtn.querySelector('.icon-muted');

    if (state.isMuted) {
      muteBtn.classList.add('active');
      iconUnmuted.style.display = 'none';
      iconMuted.style.display = '';
      muteBtn.querySelector('span').textContent = 'Unmute';
    } else {
      muteBtn.classList.remove('active');
      iconUnmuted.style.display = '';
      iconMuted.style.display = 'none';
      muteBtn.querySelector('span').textContent = 'Mute';
    }
  }

  async function toggleVideo() {
    const isVideoOn = await window.webrtcManager.toggleVideo();
    state.isVideoOn = isVideoOn;
    updateVideoUI();

    if (isVideoOn) {
      // Show local video
      els.localVideo.srcObject = window.webrtcManager.localStream;
      els.videoContainer.style.display = 'block';
      els.voiceCallDisplay.style.display = 'none';
      showToast('📹 Video dinyalakan', 'info');
    } else {
      els.localVideo.srcObject = null;
      // Only hide video container if remote also has no video
      const remoteHasVideo = els.remoteVideo.srcObject?.getVideoTracks().length > 0;
      if (!remoteHasVideo) {
        els.videoContainer.style.display = 'none';
        els.voiceCallDisplay.style.display = '';
      }
      showToast('📹 Video dimatikan', 'info');
    }
  }

  function updateVideoUI() {
    const btn = els.videoToggleBtn;
    const iconOn = btn.querySelector('.icon-video-on');
    const iconOff = btn.querySelector('.icon-video-off');

    if (state.isVideoOn) {
      btn.classList.add('active');
      iconOn.style.display = 'none';
      iconOff.style.display = '';
      btn.querySelector('span').textContent = 'Matikan';
    } else {
      btn.classList.remove('active');
      iconOn.style.display = '';
      iconOff.style.display = 'none';
      btn.querySelector('span').textContent = 'Video';
    }
  }

  // ═══════════════════════════════════════
  //  EVENT LISTENERS
  // ═══════════════════════════════════════

  // Login
  els.usernameInput.addEventListener('input', () => {
    const val = els.usernameInput.value.trim();
    els.joinBtn.disabled = val.length < 2;
    els.loginError.textContent = '';
  });

  els.usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !els.joinBtn.disabled) {
      els.joinBtn.click();
    }
  });

  els.joinBtn.addEventListener('click', () => {
    const username = els.usernameInput.value.trim();
    if (username.length < 2) return;

    els.joinBtn.disabled = true;
    els.joinBtn.querySelector('span').textContent = 'Connecting...';
    state.socket.emit('register', username);
  });

  // Logout
  els.logoutBtn.addEventListener('click', () => {
    if (state.callState !== 'idle') {
      endCall();
    }
    state.socket.disconnect();
    state.myUsername = '';
    state.mySocketId = '';
    els.usernameInput.value = '';
    els.joinBtn.disabled = true;
    els.joinBtn.querySelector('span').textContent = 'Masuk';
    showScreen('login-screen');

    // Reconnect socket for next login
    setTimeout(() => connectSocket(), 300);
  });

  // Call actions
  els.acceptBtn.addEventListener('click', acceptCall);
  els.rejectBtn.addEventListener('click', rejectCall);
  els.cancelCallBtn.addEventListener('click', endCall);
  els.hangupBtn.addEventListener('click', endCall);

  // Controls
  els.muteBtn.addEventListener('click', toggleMute);
  els.videoToggleBtn.addEventListener('click', toggleVideo);

  // Speaker toggle (just visual feedback for now)
  els.speakerBtn.addEventListener('click', () => {
    els.speakerBtn.classList.toggle('active');
    const isActive = els.speakerBtn.classList.contains('active');
    showToast(isActive ? '🔇 Speaker dimatikan' : '🔊 Speaker dinyalakan', 'info');
  });

  // ═══════════════════════════════════════
  //  INITIALIZATION
  // ═══════════════════════════════════════

  connectSocket();
  els.usernameInput.focus();

  console.log(`
  ╔══════════════════════════════════════╗
  ║   🎤 VoIP Call — WebRTC Edition     ║
  ║   Buka 2 tab untuk testing!         ║
  ╚══════════════════════════════════════╝
  `);
})();
