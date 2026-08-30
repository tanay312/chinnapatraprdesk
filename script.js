// --- CONFIGURATION ---
        const SUPABASE_URL = 'https://azdwdqwhwrhmcsxgwzal.supabase.co';
        const SUPABASE_KEY = 'sb_publishable_offnM0Rq9v3WUqIco1Dowg_EIe-9MEV';
        const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        
        const todayStr = () => {
            const d = new Date();
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            return d.toISOString().split('T')[0];
        };

        // --- DATABASE WRAPPER ---
        const DB = {
            get: async (table) => {
                const { data, error } = await supabaseClient.from(table).select('*');
                if (error) { console.error(`Error fetching ${table}:`, error); return []; }
                return data || [];
            },
            insert: async (table, row) => {
                const { data, error } = await supabaseClient.from(table).insert([row]).select();
                if (error) { UI.showToast(`DB Error: ${error.message}`, 'error'); return null; }
                return data ? data[0] : null;
            },
            update: async (table, id, updates) => {
                const { data, error } = await supabaseClient.from(table).update(updates).eq('id', id).select();
                if (error) { UI.showToast(`DB Error: ${error.message}`, 'error'); return null; }
                return data ? data[0] : null;
            },
            remove: async (table, id) => {
                const { error } = await supabaseClient.from(table).delete().eq('id', id);
                if (error) UI.showToast(`DB Error: ${error.message}`, 'error');
            }
        };
        // --- CHINNAPATRA CONNECT (LIVE CHAT) SYSTEM ---
const ChatApp = {
    subscription: null,
    
    init: async (viewPrefix) => {
        const area = document.getElementById(`chatMessagesArea_${viewPrefix}`);
        if (!area) return;
        
        // Show loading state if it's the first time
        if (area.innerHTML.trim() === '') {
            area.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted);"><i class="ph ph-spinner ph-spin" style="font-size:32px; color:var(--gold);"></i><br>Connecting to secure server...</div>';
        }
        
        // Fetch existing messages
        const messages = await DB.get('pr_chat_messages');
        messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        
        // Render initial batch
        area.innerHTML = '';
        if (messages.length === 0) {
            area.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted);">No messages yet. Be the first to start the conversation!</div>';
        } else {
            messages.forEach(m => ChatApp.appendMessage(m, viewPrefix, false));
            area.scrollTop = area.scrollHeight;
        }
        
        // Subscribe to real-time incoming and deleted messages
        if (!ChatApp.subscription) {
            ChatApp.subscription = supabaseClient.channel('public:pr_chat_messages')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pr_chat_messages' }, payload => {
                    ChatApp.appendMessage(payload.new, 'admin', true);
                    ChatApp.appendMessage(payload.new, 'pr', true);
                })
                .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pr_chat_messages' }, payload => {
                    ChatApp.removeMessage(payload.old.id, 'admin');
                    ChatApp.removeMessage(payload.old.id, 'pr');
                })
                .subscribe();
        }
    },
    
    appendMessage: (m, viewPrefix, isNewRealtimeMsg) => {
        const area = document.getElementById(`chatMessagesArea_${viewPrefix}`);
        if (!area) return;
        
        const u = App.currentUser;
        if (!u) return;
        
        const isMe = m.user_id === (u.pr_id || u.username);
        const isAdmin = u.role === 'Admin'; // Current user viewing the chat
        const isSenderAdmin = m.user_role === 'Admin'; // The user who sent the message
        
        // Users can delete their own messages, Admins can delete ANY message
        const canDelete = isMe || isAdmin;
        
        const rawDate = new Date(m.created_at + (m.created_at.includes('Z') ? '' : 'Z'));
        const timeStr = !isNaN(rawDate) ? rawDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        
        const bubbleClass = isMe ? 'me' : 'other';
        const adminClass = (!isMe && isSenderAdmin) ? 'admin' : '';
        
        const nameDisplay = isMe ? 'You' : (isSenderAdmin ? `🛡️ ${m.user_name} (Admin)` : m.user_name);
        const textColor = isMe ? 'rgba(255,255,255,0.9)' : (isSenderAdmin ? 'var(--primary)' : 'var(--text-muted)');
        
        // Delete button HTML
        const deleteBtnHtml = canDelete 
            ? `<button onclick="ChatApp.deleteMessage('${m.id}')" title="Delete Message" style="background:none; border:none; cursor:pointer; color:inherit; opacity:0.6; font-size:14px; margin-left: 8px;">
                 <i class="ph ph-trash"></i>
               </button>` 
            : '';

        const html = `
            <div id="msg_${viewPrefix}_${m.id}" class="chat-bubble ${bubbleClass} ${adminClass}">
                <div class="chat-meta" style="color: ${textColor}; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span>${nameDisplay}</span>
                        <span style="margin-left:5px;">${timeStr}</span>
                    </div>
                    ${deleteBtnHtml}
                </div>
                <div class="chat-text">${m.message.replace(/\n/g, '<br>')}</div>
            </div>
        `;
        
        if (area.innerHTML.includes('No messages yet')) area.innerHTML = '';
        
        // Track scroll position before adding
        const isScrolledToBottom = area.scrollHeight - area.clientHeight <= area.scrollTop + 50;
        
        area.insertAdjacentHTML('beforeend', html);
        
        // Auto scroll down if user was already at the bottom, or if they sent it
        if (isScrolledToBottom || isMe) {
            area.scrollTop = area.scrollHeight;
        }
        
        // Play soft notification sound if someone else sent a new message
        if (isNewRealtimeMsg && !isMe) {
            try {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/238/238-preview.mp3'); 
                audio.volume = 0.4;
                audio.play().catch(e => {}); 
            } catch(e) {}
        }
    },
    
    // Removes the message element from the DOM (triggered by Realtime DELETE)
    removeMessage: (msgId, viewPrefix) => {
        const el = document.getElementById(`msg_${viewPrefix}_${msgId}`);
        if (el) el.remove();
    },

    // Handles the database deletion
    deleteMessage: async (msgId) => {
        if (!confirm("Are you sure you want to delete this message?")) return;
        
        try {
            // Assuming you have a wrapper method for delete, or use supabase directly:
            await supabaseClient.from('pr_chat_messages').delete().eq('id', msgId);
            // If using your DB wrapper: await DB.delete('pr_chat_messages', { id: msgId });
        } catch (error) {
            console.error("Error deleting message:", error);
            alert("Failed to delete the message.");
        }
    },

    handleEnter: (e, viewPrefix) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            ChatApp.sendMessage(viewPrefix);
        }
    },
    
    sendMessage: async (viewPrefix) => {
        const input = document.getElementById(`chatInput_${viewPrefix}`);
        if (!input || !input.value.trim()) return;
        
        const msgText = input.value.trim();
        input.value = ''; // clear immediately for UX
        ChatApp.toggleEmojiPicker(viewPrefix, true); // Close emoji picker if open
        
        const u = App.currentUser;
        const userId = u.pr_id || u.username;
        
        await DB.insert('pr_chat_messages', {
            user_name: u.full_name || 'Admin',
            user_id: userId,
            user_role: u.role,
            message: msgText
        });
    },

    // --- Emoji Picker Logic ---
    toggleEmojiPicker: (viewPrefix, forceClose = false) => {
        const picker = document.getElementById(`emojiPicker_${viewPrefix}`);
        if (!picker) return;
        
        if (forceClose) {
            picker.style.display = 'none';
        } else {
            picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
        }
    },

    insertEmoji: (emoji, viewPrefix) => {
        const input = document.getElementById(`chatInput_${viewPrefix}`);
        if (!input) return;
        
        // Insert emoji at current cursor position or append to end
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        
        input.value = text.substring(0, start) + emoji + text.substring(end);
        
        // Refocus and move cursor past the inserted emoji
        input.focus();
        input.selectionStart = input.selectionEnd = start + emoji.length;
    }
};

        // Welcome Popup (Replaces old Independence Day logic)
function showWelcomePopup() {
    if (document.getElementById('welcomePopup')) return;

    const popupOverlay = document.createElement('div');
    popupOverlay.id = 'welcomePopup';
    
    popupOverlay.innerHTML = `
        <style>
            #welcomePopup {
                position: fixed; inset: 0; background: rgba(31, 42, 68, 0.85); backdrop-filter: blur(8px);
                z-index: 9999999; display: flex; align-items: center; justify-content: center;
                animation: indFadeIn 0.4s ease-out forwards;
            }
            .welcome-modal {
                background: var(--bg-main); border-radius: 24px; padding: 40px; text-align: center;
                max-width: 450px; width: 90%; position: relative;
                box-shadow: 0 24px 60px rgba(0,0,0,0.6);
                border-top: 8px solid var(--gold); border-bottom: 8px solid var(--primary);
                transform: scale(0.8) translateY(20px); opacity: 0;
                animation: indPopUp 0.6s 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards, floatSlow 6s 1s ease-in-out infinite alternate;
            }
            .welcome-close-btn {
                position: absolute; top: -18px; right: -18px; background: var(--danger); color: white;
                border: 3px solid white; width: 44px; height: 44px; border-radius: 50%; 
                font-size: 20px; font-weight: bold; font-family: Arial, sans-serif;
                cursor: pointer; display: flex; align-items: center; justify-content: center;
                box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4); z-index: 10; outline: none;
                opacity: 0; transform: scale(0) rotate(-90deg);
                animation: indClosePop 0.5s 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s; 
            }
            .welcome-close-btn:hover { transform: scale(1.15) rotate(90deg) !important; background: #DC2626; }
            .welcome-icon-box {
                width: 90px; height: 90px; background: var(--primary); border-radius: 50%; margin: 0 auto 20px auto;
                display: flex; align-items: center; justify-content: center; font-size: 45px; color: var(--gold);
                border: 4px solid var(--gold); box-shadow: 0 8px 24px rgba(200, 155, 60, 0.4);
                transform: scale(0); opacity: 0;
                animation: indZoomBounce 0.8s 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            }
            .welcome-title {
                font-family: var(--font-heading); font-size: 28px; font-weight: 700; margin-bottom: 8px; color: var(--primary);
                opacity: 0; transform: translateY(10px); animation: indSlideUp 0.5s 0.5s forwards; 
            }
            .welcome-subtitle { color: var(--text-muted); font-size: 14px; opacity: 0; animation: indFadeIn 0.5s 0.7s forwards; }
            .welcome-quote-box {
                background: rgba(31, 42, 68, 0.05); border-radius: 12px; padding: 20px; margin-top: 24px;
                border-left: 4px solid var(--gold); position: relative;
                opacity: 0; transform: translateY(20px);
                animation: indSlideUp 0.6s 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            }
            .welcome-quote { font-style: italic; color: var(--primary); font-size: 15px; font-weight: 500; line-height: 1.6; }

            @keyframes indFadeIn { to { opacity: 1; } }
            @keyframes indPopUp { to { transform: scale(1) translateY(0); opacity: 1; } }
            @keyframes indClosePop { to { transform: scale(1) rotate(0deg); opacity: 1; } }
            @keyframes indZoomBounce { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
            @keyframes indSlideUp { to { opacity: 1; transform: translateY(0); } }
        </style>

        <div class="welcome-modal">
            <button class="welcome-close-btn" onclick="document.getElementById('welcomePopup').remove()">&#10006;</button>
            
            <div class="welcome-icon-box">
                <i class="ph-fill ph-paint-brush-broad"></i>
            </div>
            
            <h2 class="welcome-title">Welcome to Chinnapatra</h2>
            <p class="welcome-subtitle">Celebrating art, culture, and creativity. ✨</p>
            
            <div class="welcome-quote-box">
                <div class="welcome-quote">"শিল্প যেখানে কথা বলে।" <br><span style="font-size:12px;color:var(--text-muted);">(Where art speaks.)</span></div>
            </div>
        </div>
        `;
    
    document.body.appendChild(popupOverlay);
}

        // --- CORE APP SYSTEM ---
        const App = {
            currentUser: null,
            
            formatSocialLink: function(baseUrl, input) {
                if (!input) return '#';
                input = input.trim();
                if (input.startsWith('http://') || input.startsWith('https://')) {
                    return input;
                }
                input = input.replace(/^@/, '');
                return `${baseUrl}${input}`;
            },

            applySettings: function() {
                const settings = JSON.parse(localStorage.getItem('app_settings') || '{"officeName":"Premium PR Headquarters","logoUrl":""}');
                
                document.querySelectorAll('.sidebar-title').forEach(el => {
                    el.innerText = settings.officeName || 'Admin Desk';
                });

                document.querySelectorAll('.sidebar-header').forEach(header => {
                    let img = header.querySelector('.custom-logo');
                    let icon = header.querySelector('.sidebar-logo-icon');
                    
                    if (settings.logoUrl) {
                        if (icon) icon.style.display = 'none';
                        if (!img) {
                            img = document.createElement('img');
                            img.className = 'custom-logo';
                            img.style.height = '32px';
                            img.style.width = '32px';
                            img.style.objectFit = 'cover';
                            img.style.borderRadius = '8px';
                            header.insertBefore(img, header.firstChild);
                        }
                        img.src = settings.logoUrl;
                        img.style.display = 'block';
                    } else {
                        if (img) img.style.display = 'none';
                        if (icon) icon.style.display = 'block';
                    }
                });

                const nameInput = document.getElementById('settingOfficeName');
                const logoInput = document.getElementById('settingLogo');
                if (nameInput) nameInput.value = settings.officeName || 'Premium PR Headquarters';
                if (logoInput) logoInput.value = settings.logoUrl || '';
            },
        renderBirthdayWidgets: async function() {
                const adminContainer = document.getElementById('adminBirthdayWidget');
                const prContainer = document.getElementById('prBirthdayWidget');

                if (!adminContainer && !prContainer) return;

                try {
                    const artists = await DB.get('artists');
                    if (!artists || artists.length === 0) return;

                    const getKolkataDate = (offsetDays = 0) => {
                        const d = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
                        d.setDate(d.getDate() + offsetDays);
                        const mm = String(d.getMonth() + 1).padStart(2, '0');
                        const dd = String(d.getDate()).padStart(2, '0');
                        return `${mm}-${dd}`;
                    };

                    const todayMMDD = getKolkataDate(0);
                    const tomorrowMMDD = getKolkataDate(1);
                    const dayAfterMMDD = getKolkataDate(2);

                    let todayBdays = [];
                    let upcomingBdays = [];

                    artists.forEach(a => {
                        if (!a.dob) return;
                        const dobMMDD = a.dob.substring(5); 
                        
                        if (dobMMDD === todayMMDD) todayBdays.push(a);
                        else if (dobMMDD === tomorrowMMDD) upcomingBdays.push({ ...a, dayText: 'Tomorrow' });
                        else if (dobMMDD === dayAfterMMDD) upcomingBdays.push({ ...a, dayText: 'In 2 Days' });
                    });

                    if (todayBdays.length === 0 && upcomingBdays.length === 0) {
                        const emptyHtml = `
                            <div class="glass-card" style="padding: 24px; text-align: center; border-top: 4px solid rgba(10,25,49,0.1); box-shadow: var(--shadow-sm);">
                                <i class="ph-fill ph-cake" style="font-size: 32px; color: var(--text-muted); opacity: 0.3; margin-bottom: 8px;"></i>
                                <p style="color: var(--text-muted); font-size: 13px; font-weight: 500; margin: 0;">No birthdays today or in the next 2 days.</p>
                            </div>`;
                        if (adminContainer) adminContainer.innerHTML = emptyHtml;
                        if (prContainer) prContainer.innerHTML = emptyHtml;
                        return;
                    }

                    let html = `
                        <div class="glass-card" style="padding: 24px; border-top: 4px solid var(--gold); position: relative; overflow: hidden; box-shadow: var(--shadow-sm);">
                            <i class="ph-fill ph-confetti" style="position: absolute; right: -20px; top: -20px; font-size: 120px; color: rgba(212, 175, 55, 0.05); transform: rotate(15deg); pointer-events: none;"></i>
                            <div style="position: relative; z-index: 1;">
                                <h3 style="font-family: var(--font-heading); color: var(--primary); font-size: 18px; margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
                                    <i class="ph-fill ph-cake" style="color: var(--gold); font-size: 24px;"></i> Birthday Calendar
                                </h3>
                    `;

                    if (todayBdays.length > 0) {
                        html += `<div style="font-size: 11px; font-weight: 800; color: var(--success); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">🎉 Today's Birthdays</div>
                        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">`;
                        todayBdays.forEach(a => {
                            html += `
                                <div style="background: rgba(16, 185, 129, 0.05); border-left: 3px solid var(--success); padding: 12px 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <strong style="color: var(--primary); font-size: 15px;">${a.name}</strong>
                                        <div style="font-size: 11px; color: var(--text-muted); font-weight: 600; margin-top: 2px;">${a.department || 'Creative Team'}</div>
                                    </div>
                                    <span class="badge badge-completed" style="font-size: 10px; animation: pulse 2s infinite;">TODAY</span>
                                </div>
                            `;
                        });
                        html += `</div>`;
                    }

                    if (upcomingBdays.length > 0) {
                        html += `<div style="font-size: 11px; font-weight: 800; color: var(--gold); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">✨ Upcoming Birthdays</div>
                        <div style="display: flex; flex-direction: column; gap: 10px;">`;
                        upcomingBdays.forEach(a => {
                            html += `
                                <div style="background: rgba(212, 175, 55, 0.05); border-left: 3px solid var(--gold); padding: 12px 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <strong style="color: var(--primary); font-size: 14px;">${a.name}</strong>
                                        <div style="font-size: 11px; color: var(--text-muted); font-weight: 600; margin-top: 2px;">${a.department || 'Creative Team'}</div>
                                    </div>
                                    <span class="badge badge-pending" style="font-size: 10px;">${a.dayText}</span>
                                </div>
                            `;
                        });
                        html += `</div>`;
                    }

                    html += `</div></div>`;

                    if (adminContainer) adminContainer.innerHTML = html;
                    if (prContainer) prContainer.innerHTML = html;

                } catch (err) {
                    console.error("Failed to load birthdays:", err);
                }
            },

            init: function() {
                setTimeout(() => {
                    const splash = document.getElementById('splash-screen');
                    if (splash) {
                        splash.classList.add('hidden');
                        setTimeout(() => splash.remove(), 600);
                    }
                }, 3500);

                LiveClock.init();
                this.applySettings();
                this.autoCloseMissedSessions();
                
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.register('sw.js')
                        .then(() => console.log('PWA Service Worker Registered!'))
                        .catch(err => console.error('Service Worker Error:', err));
                }

                window.addEventListener('beforeinstallprompt', (e) => {
                    e.preventDefault();
                    window.deferredPrompt = e;
                    const installBtn = document.getElementById('installAppBtn');
                    if (installBtn) {
                        installBtn.style.display = 'inline-flex';
                        installBtn.addEventListener('click', () => {
                            installBtn.style.display = 'none';
                            window.deferredPrompt.prompt();
                            window.deferredPrompt.userChoice.then((choiceResult) => {
                                window.deferredPrompt = null;
                            });
                        });
                    }
                });

                document.addEventListener('click', function(e) {
                    if (e.target.closest('.btn') || e.target.closest('.ripple-btn')) {
                        const btn = e.target.closest('.btn') || e.target.closest('.ripple-btn');
                        if (btn.style.position !== 'relative') btn.style.position = 'relative';
                        btn.style.overflow = 'hidden';
                        
                        const circle = document.createElement('span');
                        const diameter = Math.max(btn.clientWidth, btn.clientHeight);
                        const radius = diameter / 2;
                        
                        const rect = btn.getBoundingClientRect();
                        circle.style.width = circle.style.height = `${diameter}px`;
                        circle.style.left = `${e.clientX - rect.left - radius}px`;
                        circle.style.top = `${e.clientY - rect.top - radius}px`;
                        circle.classList.add('ripple');
                        
                        const existing = btn.querySelector('.ripple');
                        if(existing) existing.remove();
                        btn.appendChild(circle);
                    }
                });

                const session = sessionStorage.getItem('active_user');
                if (session) {
                    this.currentUser = JSON.parse(session);
                    this.route(this.currentUser.role === 'Admin' ? 'page-admin' : 'page-pr');
                    setTimeout(() => {
                        showWelcomePopup();
                    }, 3600);
                }
                
                document.getElementById('filterAttDate').value = todayStr();
                document.getElementById('reportDate').value = todayStr();
                Auth.fillDemoCredentials();
            },

            autoCloseMissedSessions: async function() {
                const today = todayStr();
                const attendance = await DB.get('attendance') || [];
                
                for (let record of attendance) {
                    if (record.date < today && record.sessions && record.sessions.length > 0) {
                        let lastSession = record.sessions[record.sessions.length - 1];
                        if (lastSession.check_out === null) {
                            const autoOutTime = new Date(`${record.date}T23:59:59`).toISOString();
                            lastSession.check_out = autoOutTime;
                            
                            let totalMinutes = 0;
                            record.sessions.forEach(s => {
                                if (s.check_in && s.check_out) {
                                    totalMinutes += Math.floor((new Date(s.check_out) - new Date(s.check_in)) / 60000);
                                }
                            });
                            
                            const autoNote = `Session ${record.sessions.length}: [System Auto-Checkout]`;
                            let updatedSummary = record.work_summary || "";
                            updatedSummary = updatedSummary ? updatedSummary + " | \n" + autoNote : autoNote;
                            
                            await DB.update('attendance', record.id, {
                                sessions: record.sessions,
                                total_minutes: totalMinutes,
                                work_summary: updatedSummary
                            });
                        }
                    }
                }
            },

            route: function(pageId) {
                document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active'));
                const pageEl = document.getElementById(pageId);
                if (pageEl) pageEl.classList.add('active');
                
                if (pageId === 'page-admin') AdminApp.init();
                if (pageId === 'page-pr') PRApp.init();
                if (pageId === 'page-public-member-leave') PublicApp.init(); 

                
            }
        };

        // --- UI & TOASTS ---
        const UI = {
            showToast: (msg, type='success') => {
                const container = document.getElementById('toastArea');
                const toast = document.createElement('div');
                toast.className = `toast ${type}`;
                let icon = type === 'error' ? 'ph-x-circle' : (type === 'warning' ? 'ph-warning-circle' : 'ph-check-circle');
                toast.innerHTML = `<i class="ph-fill ${icon} toast-icon"></i><div>${msg}</div>`;
                container.appendChild(toast);
                setTimeout(() => toast.classList.add('show'), 10);
                setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3000);
            },
            showModal: (title, html) => {
                document.getElementById('modalTitle').innerText = title;
                document.getElementById('modalBody').innerHTML = html;
                document.getElementById('mainModal').classList.add('active');
            },
            closeModal: () => document.getElementById('mainModal').classList.remove('active'),
            toggleSidebar: () => document.querySelectorAll('.sidebar').forEach(sb => { if (sb.closest('.page-view.active')) sb.classList.toggle('active'); }),
            confirm: (title, msg, onConfirm) => {
                UI.showModal(title, `
                    <div style="text-align:center; padding: 20px 0;">
                        <i class="ph-fill ph-warning-circle" style="font-size: 64px; color: var(--warning); margin-bottom: 16px;"></i>
                        <p style="margin-bottom: 24px; color: var(--text-muted);">${msg}</p>
                        <div style="display:flex; gap:12px; justify-content:center;">
                            <button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>
                            <button class="btn btn-primary" id="confirmActionBtn">Confirm</button>
                        </div>
                    </div>
                `);
                document.getElementById('confirmActionBtn').onclick = () => { UI.closeModal(); onConfirm(); };
            },
            showWhatsAppNotification: (title, message) => {
                const container = document.getElementById('toastArea');
                const toast = document.createElement('div');
                toast.className = `toast whatsapp-toast`;
                
                const shortMessage = message.length > 60 ? message.substring(0, 60) + '...' : message;
                
                toast.innerHTML = `
                    <i class="ph-fill ph-whatsapp-logo toast-icon"></i>
                    <div class="whatsapp-text">
                        <strong>${title}</strong>
                        <span>${shortMessage}</span>
                    </div>
                `;
                container.appendChild(toast);
                setTimeout(() => toast.classList.add('show'), 10);
                setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 6000);
            }
        };
        
        // --- AUTHENTICATION ---
        const Auth = {
            fillDemoCredentials: () => {
                const role = document.getElementById('loginRole').value;
                if(role === 'Admin') {
                    document.getElementById('loginUsername').value = 'admin';
                    document.getElementById('loginPassword').value = 'admin123';
                } else {
                    document.getElementById('loginUsername').value = 'pr.john';
                    document.getElementById('loginPassword').value = 'password';
                }
            },
            login: async (e) => {
                e.preventDefault();
                const u = document.getElementById('loginUsername').value;
                const p = document.getElementById('loginPassword').value;
                const r = document.getElementById('loginRole').value;
                
                if ('Notification' in window && Notification.permission !== 'granted') {
                    Notification.requestPermission();
                }

                const btn = e.target.querySelector('button');
                const origText = btn.innerHTML;
                btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Authenticating...';
                btn.disabled = true;

                const users = await DB.get('users');
                btn.innerHTML = origText;
                btn.disabled = false;

                if (!users || users.length === 0) return UI.showToast('Database connection failed.', 'error');

                const user = users.find(user => user.role === r && user.password === p && (user.username === u || user.pr_id === u));

                if (user) {
                    if(user.status === 'Disabled') return UI.showToast('Account disabled by Admin.', 'error');
                    App.currentUser = user;
                    sessionStorage.setItem('active_user', JSON.stringify(user));
                    UI.showToast(`Welcome back, ${user.full_name || r}! `);
                    App.route(r === 'Admin' ? 'page-admin' : 'page-pr');
                    showWelcomePopupss();
                } else {
                    UI.showToast('Invalid credentials. Check your username & password.', 'error');
                }
            },
            logout: () => {
                App.currentUser = null;
                sessionStorage.removeItem('active_user');
                App.route('page-login');
                UI.showToast('Logged out successfully.');
            }
        };

        // --- PUBLIC APP (Member Leave) ---
        const PublicApp = {
            allArtists: [], 
            init: async () => {
                try {
                    const artists = await DB.get('artists');
                    PublicApp.allArtists = artists || [];
                    const select = document.getElementById('mlArtist');
                    if (!select) return; 
                    
                    select.innerHTML = '<option value="">Select Member...</option>';
                    PublicApp.allArtists.forEach(a => {
                        select.innerHTML += `<option value="${a.id}">${a.name}</option>`;
                    });
                    document.getElementById('mlDepartment').innerHTML = '';
                } catch (err) { console.error("Failed to load artists:", err); }
            },
            onArtistChange: () => {
                const artistId = document.getElementById('mlArtist').value;
                const deptSelect = document.getElementById('mlDepartment');
                deptSelect.innerHTML = ''; 

                if (!artistId) return;

                const artist = PublicApp.allArtists.find(a => a.id === artistId);
                if (artist && artist.department) {
                    const depts = artist.department.split(',').map(d => d.trim()).filter(d => d !== '');
                    depts.forEach(d => { deptSelect.innerHTML += `<option value="${d}">${d}</option>`; });
                } else {
                    deptSelect.innerHTML = '<option value="" disabled>No departments found</option>';
                }
            },
            calcDays: () => {
                const f = document.getElementById('mlFrom').value; 
                const t = document.getElementById('mlTo').value;
                if (f && t) {
                    const days = Math.max(0, Math.ceil((new Date(t) - new Date(f)) / (1000 * 60 * 60 * 24)) + 1);
                    document.getElementById('mlDaysText').innerText = days;
                } else { document.getElementById('mlDaysText').innerText = '0'; }
            },
            submitLeave: async (e) => {
                e.preventDefault();
                const days = parseInt(document.getElementById('mlDaysText').innerText);
                if(isNaN(days) || days <= 0) return UI.showToast('Invalid dates selected.', 'error');

                const artistId = document.getElementById('mlArtist').value;
                const deptSelect = document.getElementById('mlDepartment');
                const selectedDepts = Array.from(deptSelect.selectedOptions).map(opt => opt.value).join(', ');
                
                if(!artistId || !selectedDepts) return UI.showToast('Please select an artist and at least one department.', 'error');

                const artist = PublicApp.allArtists.find(a => a.id === artistId);
                const artistName = artist ? artist.name : 'Unknown Artist';

                const btn = e.target.querySelector('button'); 
                const originalText = btn.innerHTML;
                btn.disabled = true; 
                btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Submitting...';

                const formattedName = `${artistName} (${selectedDepts})`;

                const result = await DB.insert('member_leave_requests', { 
                    member_name: formattedName, 
                    mobile: document.getElementById('mlMobile').value, 
                    leave_from: document.getElementById('mlFrom').value, 
                    leave_to: document.getElementById('mlTo').value, 
                    total_days: days, 
                    reason: document.getElementById('mlReason').value, 
                    status: 'Pending' 
                });

                if (!result) { btn.disabled = false; btn.innerHTML = originalText; return; }

                e.target.reset(); 
                document.getElementById('mlDaysText').innerText = '0'; 
                document.getElementById('mlDepartment').innerHTML = '';
                btn.disabled = false; 
                btn.innerHTML = originalText;
                
                UI.showModal('Request Submitted', `
                    <div style="text-align:center;">
                        <div style="font-size: 64px; color: var(--success); margin-bottom: 16px;"><i class="ph-fill ph-check-circle"></i></div>
                        <h3 style="margin-bottom:8px;">Thank You!</h3>
                        <p style="color: var(--text-muted); margin-bottom: 24px;">Your leave request has been submitted.</p>
                        <button class="btn btn-primary" onclick="UI.closeModal(); App.route('page-login')">Return to Login</button>
                    </div>
                `);
            }
        };

        // --- ADMIN APP ---
        const AdminApp = {
            prGroups: ['PR GROUP SUBHAJIT', 'PR GROUP SOUMYARUP', 'PR GROUP ANKITA', 'PR GROUP KOYEL'],
            cachedArtists: [],
            cachedPRs: [],
            cachedMemberLeaves: [],
            cachedActivities: [],
            cachedSpecialDays: [],
            dashboardInterval: null,
            editAttState: null,

            init: () => { AdminApp.switchTab('admin-dashboard'); },
            switchTab: (tabId, evt) => {
                const view = document.getElementById('page-admin');
                if (!view) return;

                view.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
                if (evt && evt.currentTarget) {
                    evt.currentTarget.classList.add('active');
                } else {
                    const matchingNav = view.querySelector(`.nav-item[onclick*="${tabId}"]`);
                    if (matchingNav) matchingNav.classList.add('active');
                }

                view.querySelectorAll('.dashboard-view').forEach(el => el.classList.remove('active'));
                const targetView = document.getElementById(tabId);
                if (targetView) targetView.classList.add('active');

                if (window.innerWidth < 992) UI.toggleSidebar();

                if(tabId === 'admin-dashboard') AdminApp.startRealtimeDashboard();
                if(tabId === 'admin-pr') AdminApp.renderPRs();
                if(tabId === 'admin-members') AdminApp.initMembersTab();
                if(tabId === 'admin-attendance') { 
                    const attDate = document.getElementById('filterAttDate');
                    if(attDate && !attDate.value) attDate.value = todayStr(); 
                    AdminApp.renderAttendance(); 
                }
                if(tabId === 'admin-holidays') AdminApp.renderHolidays();
                if(tabId === 'admin-pr-leave') AdminApp.renderPRLeaves();
                if(tabId === 'admin-member-leave') AdminApp.renderMemberLeaves();
                if(tabId === 'admin-approved-member-leave') AdminApp.renderApprovedMemberLeaves();
                if(tabId === 'admin-notifications') AdminApp.renderNotifications();
                if(tabId === 'admin-invites') { 
                    const invDate = document.getElementById('inviteDate');
                    if(invDate && !invDate.value) invDate.value = todayStr(); 
                    AdminApp.loadInvites(); 
                }
                if(tabId === 'admin-pr-activity') AdminApp.initPRActivityTab();
                if(tabId === 'admin-artists') AdminApp.renderArtistTracking();
                if(tabId === 'admin-special-days') AdminApp.initSpecialDaysTab();
                if(tabId === 'admin-complaints') AdminApp.renderComplaints();
                if(tabId === 'admin-chat') ChatApp.init('admin');
                if(tabId === 'admin-pr-worklist') AdminApp.initPRWorkListTab();
                if(tabId === 'admin-media-workflow') MediaAdmin.init()
            },
            // --- PR WORK LIST ASSIGNMENT ---
            initPRWorkListTab: async () => {
                if (!AdminApp.cachedPRs || AdminApp.cachedPRs.length === 0) {
                    const users = await DB.get('users') || [];
                    AdminApp.cachedPRs = users.filter(u => u && u.role === 'PR');
                }
                AdminApp.renderPRWorkLists();
            },

            renderPRWorkLists: async () => {
                const workLists = await DB.get('pr_work_lists') || [];
                workLists.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                
                let html = '';
                workLists.forEach(w => {
                    const pr = (AdminApp.cachedPRs || []).find(p => p.pr_id === w.pr_id);
                    const prName = pr ? pr.full_name : w.pr_id;
                    
                    // FIXED: Safely parsing the date without breaking the timezone string
                    const rawDate = w.created_at ? new Date(w.created_at) : new Date();
                    const dateStr = !isNaN(rawDate) ? rawDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date';
                    
                    html += `<tr>
                        <td><strong>${dateStr}</strong></td>
                        <td>${prName}<br><small style="color:var(--text-muted);">${w.pr_id}</small></td>
                        <td><span style="color:var(--primary); font-weight:600;">${w.title}</span></td>
                        <td>
                            <button class="btn btn-danger" style="padding: 4px 8px;" onclick="AdminApp.deletePRWorkList('${w.id}')" title="Delete">
                                <i class="ph ph-trash"></i>
                            </button>
                        </td>
                    </tr>`;
                });
                
                const tbody = document.getElementById('tableAdminWorkLists');
                if (tbody) tbody.innerHTML = html || '<tr><td colspan="4" class="text-center text-muted">No work lists assigned yet.</td></tr>';
            },

            openAssignWorkListModal: () => {
                let prOptions = `<option value="">-- Select PR Executive --</option>`;
                (AdminApp.cachedPRs || []).forEach(pr => { 
                    prOptions += `<option value="${pr.pr_id}">${pr.full_name} (${pr.pr_id})</option>`; 
                });

                UI.showModal('Assign Work List', `
                    <form onsubmit="AdminApp.savePRWorkList(event)">
                        <div class="form-group">
                            <label class="form-label">Assign To</label>
                            <select id="wlPRSelect" class="form-control" required>${prOptions}</select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Work List Title / Subject</label>
                            <input type="text" id="wlTitle" class="form-control" placeholder="e.g. Weekly Campaign Tasks" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Tasks (Enter 1 task per line)</label>
                            <textarea id="wlTasks" class="form-control" style="min-height: 150px;" placeholder="- Upload 5 FB posts\n- Share group links\n- Collect artist details..." required></textarea>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width:100%; margin-top: 16px;"><i class="ph-bold ph-paper-plane-right"></i> Send Work List</button>
                    </form>
                `);
            },

            savePRWorkList: async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button');
                const origHtml = btn.innerHTML;
                btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Saving...';
                btn.disabled = true;

                const payload = {
                    pr_id: document.getElementById('wlPRSelect').value,
                    title: document.getElementById('wlTitle').value,
                    tasks: document.getElementById('wlTasks').value
                };

                await DB.insert('pr_work_lists', payload);
                
                UI.closeModal();
                UI.showToast('Work list assigned successfully!', 'success');
                AdminApp.renderPRWorkLists();
            },

            deletePRWorkList: (id) => {
                UI.confirm('Delete Work List', 'Are you sure you want to delete this assigned work list?', async () => {
                    await DB.remove('pr_work_lists', id);
                    UI.showToast('Work list deleted.', 'success');
                    AdminApp.renderPRWorkLists();
                });
            },

            // --- SPECIAL DAYS CALENDAR ---
            initSpecialDaysTab: async () => {
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const monthInput = document.getElementById('specialDaysMonth');
                if (monthInput) monthInput.value = `${yyyy}-${mm}`;
                const searchInput = document.getElementById('specialDaysSearch');
                if (searchInput) searchInput.value = '';
                
                AdminApp.cachedSpecialDays = await DB.get('special_days') || [];
                AdminApp.renderSpecialDays();
            },

            renderSpecialDays: async () => {
                const monthInput = document.getElementById('specialDaysMonth');
                const searchInput = document.getElementById('specialDaysSearch');
                const monthVal = monthInput ? monthInput.value : '';
                const searchDate = searchInput ? searchInput.value : '';
                const tbody = document.getElementById('tableSpecialDays');
                if (!tbody) return;

                let targetDates = [];

                if (searchDate) {
                    targetDates.push(searchDate);
                } else if (monthVal) {
                    const [y, m] = monthVal.split('-');
                    const daysInMonth = new Date(y, m, 0).getDate();
                    for (let i = 1; i <= daysInMonth; i++) {
                        const dayStr = String(i).padStart(2, '0');
                        targetDates.push(`${y}-${m}-${dayStr}`);
                    }
                }

                let html = '';
                targetDates.forEach(dateStr => {
                    const dObj = new Date(dateStr);
                    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dObj.getDay()];
                    
                    const existing = (AdminApp.cachedSpecialDays || []).find(s => s && s.day_date === dateStr);
                    const val = existing ? existing.title : '';
                    const recId = existing ? existing.id : '';

                    const rowStyle = val ? 'background: rgba(212, 175, 55, 0.05);' : (dayName==='Sun' ? 'background: rgba(239, 68, 68, 0.02);' : '');

                    html += `<tr style="${rowStyle}">
                        <td><strong>${dateStr}</strong></td>
                        <td><span class="${dayName === 'Sun' ? 'text-danger font-weight-bold' : 'text-muted'}">${dayName}</span></td>
                        <td>
                            <input type="text" id="sd_val_${dateStr}" class="form-control" placeholder="Type special day / event..." value="${val}" style="border-color: ${val ? 'var(--gold)' : 'rgba(10,25,49,0.1)'};">
                        </td>
                        <td>
                            <button class="btn ${val ? 'btn-success' : 'btn-primary'} btn-sm" style="padding: 6px 16px;" onclick="AdminApp.saveSpecialDay('${dateStr}', '${recId}')">
                                <i class="ph-bold ${val ? 'ph-check' : 'ph-floppy-disk'}"></i> ${val ? 'Update' : 'Save'}
                            </button>
                        </td>
                    </tr>`;
                });

                tbody.innerHTML = html || '<tr><td colspan="4" class="text-center">Select a month or date.</td></tr>';
            },

            saveSpecialDay: async (dateStr, recId) => {
                const inputEl = document.getElementById(`sd_val_${dateStr}`);
                const val = inputEl ? inputEl.value.trim() : '';
                
                if (!val && recId && recId !== 'undefined' && recId !== 'null') {
                    await DB.remove('special_days', recId);
                    UI.showToast('Special day cleared.');
                } else if (val && recId && recId !== 'undefined' && recId !== 'null') {
                    await DB.update('special_days', recId, { title: val });
                    UI.showToast('Special day updated.', 'success');
                } else if (val) {
                    await DB.insert('special_days', { day_date: dateStr, title: val });
                    UI.showToast('Special day saved.', 'success');
                } else {
                    return; 
                }
                
                AdminApp.cachedSpecialDays = await DB.get('special_days') || [];
                AdminApp.renderSpecialDays();
            },
            // --- GRIEVANCE / COMPLAINTS DESK ---
            cachedComplaints: [], // Safely cache data to prevent HTML breaking

            renderComplaints: async () => {
                const tbody = document.getElementById('tableComplaints');
                if (!tbody) return;
                tbody.innerHTML = '<tr><td colspan="6" class="text-center"><i class="ph ph-spinner ph-spin"></i> Loading complaints...</td></tr>';

                const { data: complaints, error } = await supabaseClient.from('member_complaints').select('*').order('created_at', { ascending: false });
                
                if (error || !complaints || complaints.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No complaints received yet.</td></tr>';
                    return;
                }

                // Cache the data safely
                AdminApp.cachedComplaints = complaints;

                let html = '';
                complaints.forEach(c => {
                    const dateStr = new Date(c.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                    
                    // Set Status Badge Colors
                    let statusClass = 'badge-absent'; // Default Red (Pending)
                    if (c.status === 'Reviewed') statusClass = 'badge-pending'; // Yellow
                    if (c.status === 'Resolved') statusClass = 'badge-completed'; // Green
                    
                    const snippet = c.complaint_text.length > 50 ? c.complaint_text.substring(0, 50) + '...' : c.complaint_text;
                    const attachBadge = (c.images && c.images.length > 0) ? `<br><small style="color:var(--primary);"><i class="ph-bold ph-image"></i> ${c.images.length} Photos</small>` : '';

                    html += `<tr>
                        <td>${dateStr}</td>
                        <td><strong>${c.member_name}</strong><br><small>${c.mobile} | ID: ${c.member_id || 'N/A'}</small></td>
                        <td style="max-width: 250px; white-space: normal;">${snippet} ${attachBadge}</td>
                        <td><span class="badge ${statusClass}">${c.status}</span></td>
                        <td>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-outline btn-sm" style="padding: 6px 12px; border-color: var(--primary); color: var(--primary);" onclick="AdminApp.viewComplaint('${c.id}')">
                                    <i class="ph-bold ph-eye"></i> View
                                </button>
                                <button class="btn btn-danger btn-sm" style="padding: 6px 12px;" onclick="AdminApp.deleteComplaint('${c.id}')" title="Delete Complaint">
                                    <i class="ph-bold ph-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>`;
                });
                tbody.innerHTML = html;
            },

            viewComplaint: (id) => {
                // Fetch the complaint safely from cache
                const c = AdminApp.cachedComplaints.find(x => x.id === id);
                if (!c) return;

                let imagesHtml = '';
                if (c.images && c.images.length > 0) {
                    imagesHtml = `<h4 style="margin-top:20px; font-size: 14px; color: var(--text-muted);">Attached Evidence:</h4>
                    <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px;">`;
                    c.images.forEach(img => {
                        imagesHtml += `<a href="${img}" target="_blank"><img src="${img}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 1px solid #ddd; cursor: pointer;"></a>`;
                    });
                    imagesHtml += `</div>`;
                }

                // Determine dynamic status color
                let statusColor = c.status === 'Resolved' ? 'var(--success)' : (c.status === 'Reviewed' ? '#F59E0B' : 'var(--danger)');

                UI.showModal('Complaint Details', `
                    <div style="background: rgba(239, 68, 68, 0.05); padding: 16px; border-radius: 8px; border-left: 4px solid var(--danger); margin-bottom: 20px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px;">
                            <div><strong style="color: var(--text-muted);">From:</strong> <br>${c.member_name} (ID: ${c.member_id || 'None'})</div>
                            <div><strong style="color: var(--text-muted);">Contact:</strong> <br>${c.mobile} <br>${c.email}</div>
                        </div>
                    </div>
                    
                    <h4 style="font-size: 14px; color: var(--text-muted); margin-bottom: 8px;">Grievance Text:</h4>
                    <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; font-size: 14px; line-height: 1.6; border: 1px solid #eee; white-space: pre-wrap;">${c.complaint_text}</div>
                    
                    ${imagesHtml}

                    <div style="margin-top: 24px; border-top: 1px solid #eee; padding-top: 16px;">
                        <h4 style="font-size: 14px; color: var(--text-muted); margin-bottom: 8px;">Current Status: <span style="color: ${statusColor}; font-weight: bold;">${c.status.toUpperCase()}</span></h4>
                        <div style="display: flex; gap: 12px; margin-top: 12px;">
                            ${c.status === 'Pending' ? `<button class="btn btn-outline" style="border-color: #F59E0B; color: #F59E0B;" onclick="AdminApp.updateComplaintStatus('${c.id}', 'Reviewed')">Mark as Reviewed</button>` : ''}
                            ${c.status !== 'Resolved' ? `<button class="btn btn-success" onclick="AdminApp.updateComplaintStatus('${c.id}', 'Resolved')"><i class="ph-bold ph-check"></i> Mark as Resolved</button>` : ''}
                            ${c.status === 'Resolved' ? `<div style="padding: 12px; width: 100%; background: var(--success-light); color: var(--success); text-align: center; border-radius: 8px; font-weight: 600;"><i class="ph-fill ph-check-circle"></i> This grievance has been completely resolved.</div>` : ''}
                        </div>
                    </div>
                `);
            },

            updateComplaintStatus: async (id, status) => {
                const { error } = await supabaseClient.from('member_complaints').update({ status: status }).eq('id', id);
                if (error) {
                    UI.showToast('Error updating status', 'error');
                    console.error("Status Update Error:", error);
                } else {
                    UI.showToast(`Complaint marked as ${status}`, 'success');
                    UI.closeModal();
                    AdminApp.renderComplaints(); // Refresh the table
                }
            },

            deleteComplaint: async (id) => {
                // Confirm before deleting
                UI.confirm('Delete Grievance', 'Are you sure you want to permanently delete this complaint? This action cannot be undone.', async () => {
                    const { error } = await supabaseClient.from('member_complaints').delete().eq('id', id);
                    if (error) {
                        UI.showToast('Error deleting complaint', 'error');
                        console.error("Delete Error:", error);
                    } else {
                        UI.showToast('Complaint deleted successfully', 'success');
                        AdminApp.renderComplaints(); // Refresh the table
                    }
                });
            },

            exportSpecialDaysCSV: () => {
                const monthInput = document.getElementById('specialDaysMonth');
                const searchInput = document.getElementById('specialDaysSearch');
                const monthVal = monthInput ? monthInput.value : '';
                const searchDate = searchInput ? searchInput.value : '';
                const rows = [["Date", "Day", "Special Event Name"]];
                
                let targetDates = [];
                if (searchDate) {
                    targetDates.push(searchDate);
                } else if (monthVal) {
                    const [y, m] = monthVal.split('-');
                    const daysInMonth = new Date(y, m, 0).getDate();
                    for (let i = 1; i <= daysInMonth; i++) {
                        targetDates.push(`${y}-${m}-${String(i).padStart(2, '0')}`);
                    }
                }

                targetDates.forEach(dateStr => {
                    const dObj = new Date(dateStr);
                    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dObj.getDay()];
                    const existing = (AdminApp.cachedSpecialDays || []).find(s => s && s.day_date === dateStr);
                    if (existing && existing.title) {
                         rows.push([dateStr, dayName, existing.title]);
                    }
                });

                if(rows.length === 1) return UI.showToast("No special days to export for this selection.", "warning");

                const csvContent = "\uFEFF" + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
                const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = `Special_Days_${monthVal || searchDate}.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                UI.showToast("CSV Downloaded!", "success");
            },

            exportSpecialDaysPDF: () => {
                if (!window.jspdf) return UI.showToast("PDF Library loading...", "warning");
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                
                const monthInput = document.getElementById('specialDaysMonth');
                const searchInput = document.getElementById('specialDaysSearch');
                const monthVal = monthInput ? monthInput.value : '';
                const searchDate = searchInput ? searchInput.value : '';

                // Format the display date nicely (e.g., "2026-08" -> "August 2026")
                let displaySelection = searchDate || monthVal;
                if (monthVal && !searchDate) {
                    const [y, m] = monthVal.split('-');
                    const dateObj = new Date(y, m - 1);
                    displaySelection = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                }

                const rows = [];
                let targetDates = [];
                if (searchDate) targetDates.push(searchDate);
                else if (monthVal) {
                    const [y, m] = monthVal.split('-');
                    const daysInMonth = new Date(y, m, 0).getDate();
                    for (let i = 1; i <= daysInMonth; i++) targetDates.push(`${y}-${m}-${String(i).padStart(2, '0')}`);
                }

                targetDates.forEach(dateStr => {
                    const dObj = new Date(dateStr);
                    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dObj.getDay()];
                    const existing = (AdminApp.cachedSpecialDays || []).find(s => s && s.day_date === dateStr);
                    if (existing && existing.title) {
                         rows.push([dateStr, dayName, existing.title]);
                    }
                });

                if(rows.length === 0) return UI.showToast("No special days to export.", "warning");

                // --- CHINNAPATRA OFFICIAL THEME HEADER ---
                // Navy Blue Background Header
                doc.setFillColor(10, 25, 49); // var(--primary)
                doc.rect(0, 0, 210, 40, 'F');
                
                // Gold Accent Line
                doc.setFillColor(255, 153, 51); // var(--gold)
                doc.rect(0, 40, 210, 2, 'F');

                // Main Heading
                doc.setTextColor(255, 153, 51); // Gold text
                doc.setFont("helvetica", "bold");
                doc.setFontSize(26);
                doc.text("CHINNAPATRA OFFICIAL", 105, 20, { align: "center" });
                
                // Subtitle
                doc.setTextColor(255, 255, 255); // White text
                doc.setFont("helvetica", "normal");
                doc.setFontSize(14);
                doc.text("Special Day List", 105, 30, { align: "center" });

                // Date Selection Details
                doc.setTextColor(10, 25, 49); // Navy Blue
                doc.setFont("helvetica", "bold");
                doc.setFontSize(12);
                doc.text(`Month / Year: ${displaySelection}`, 14, 52);

                // --- TABLE GENERATION ---
                doc.autoTable({
                    startY: 58,
                    head: [["Date", "Day", "Special Event Name"]],
                    body: rows,
                    styles: { 
                        font: "helvetica", 
                        fontSize: 11, 
                        cellPadding: 6 
                    }, 
                    headStyles: { 
                        fillColor: [10, 25, 49],   // Navy Blue Header
                        textColor: [255, 153, 51], // Gold Text
                        fontStyle: "bold" 
                    },
                    alternateRowStyles: {
                        fillColor: [248, 249, 250] // Very light grey for contrast
                    }
                });

                // --- CHINNAPATRA OFFICIAL STAMP ---
                const finalY = doc.lastAutoTable.finalY; // Get the Y position where the table ended
                
                // Draw Stamp Box at the bottom right
                doc.setDrawColor(255, 153, 51); // Gold border
                doc.setLineWidth(0.8);
                doc.roundedRect(135, finalY + 15, 60, 16, 2, 2, 'S');
                
                // Stamp Text
                doc.setTextColor(255, 153, 51); // Gold text
                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.text("AUTHORIZED BY", 165, finalY + 22, { align: "center" });
                doc.setFontSize(12);
                doc.text("CHINNAPATRA OFFICIAL", 165, finalY + 28, { align: "center" });

                // --- SAVE PDF ---
                doc.save(`Chinnapatra_Special_Days_${monthVal || searchDate}.pdf`);
                UI.showToast("Premium PDF Generated!", "success");
            },

            // --- MEMBER DIRECTORY (ARTISTS) ---
            initMembersTab: async () => {
                const artists = await DB.get('artists') || [];
                AdminApp.cachedArtists = artists;
                
                const deptSelect = document.getElementById('filterMemberDept');
                if (deptSelect) {
                    let allDepts = new Set();
                    artists.forEach(a => { if (a && a.department) a.department.split(',').forEach(d => allDepts.add(d.trim())); });
                    
                    let deptHtml = '<option value="">All Departments</option>';
                    allDepts.forEach(d => { if(d) deptHtml += `<option value="${d}">${d}</option>`; });
                    deptSelect.innerHTML = deptHtml;
                }
                
                AdminApp.renderMembers();
            },
            
            renderMembers: async () => {
                const searchEl = document.getElementById('searchMember');
                const deptEl = document.getElementById('filterMemberDept');
                const term = searchEl ? searchEl.value.toLowerCase() : '';
                const deptFilter = deptEl ? deptEl.value : '';
                const date = todayStr();
                
                const leaves = await DB.get('member_leave_requests') || [];
                let filtered = AdminApp.cachedArtists || [];
                
                if (deptFilter) {
                    filtered = filtered.filter(a => a && a.department && a.department.split(',').map(d=>d.trim()).includes(deptFilter));
                }
                if (term) {
                    filtered = filtered.filter(a => {
                        if (!a) return false;
                        const shortId = (a.id || '').substring(0,6).toLowerCase();
                        const name = (a.name || '').toLowerCase();
                        const mob = (a.mobile_number || '').toLowerCase();
                        return name.includes(term) || shortId.includes(term) || mob.includes(term);
                    });
                }
                
                let html = '';
                filtered.forEach(a => {
                    const shortId = (a.id || '').substring(0, 6).toUpperCase();
                    
                    const onLeave = leaves.find(l => l && l.status === 'Approved' && l.member_name.startsWith(a.name) && date >= l.leave_from && date <= l.leave_to);
                    const leaveBadge = onLeave ? `<span class="badge badge-pending">On Leave</span>` : `<span class="badge badge-completed">Working</span>`;
                    
                    const fbUrl = App.formatSocialLink('https://www.facebook.com/', a.facebook);
                    const igUrl = App.formatSocialLink('https://www.instagram.com/', a.instagram);
                    
                    const fb = a.facebook ? `<a href="${fbUrl}" target="_blank" style="color:#1877F2; font-size:20px;"><i class="ph-fill ph-facebook-logo"></i></a>` : `<i class="ph ph-facebook-logo text-muted" style="font-size:20px; opacity:0.3;"></i>`;
                    const ig = a.instagram ? `<a href="${igUrl}" target="_blank" style="color:#E4405F; font-size:20px;"><i class="ph-fill ph-instagram-logo"></i></a>` : `<i class="ph ph-instagram-logo text-muted" style="font-size:20px; opacity:0.3;"></i>`;
                    
                    html += `<tr>
                        <td><strong style="color:var(--gold);">${shortId}</strong></td>
                        <td><strong>${a.name}</strong><br><small style="color:var(--text-muted);">${a.nickname || ''}</small></td>
                        <td style="white-space: pre-wrap; max-width: 150px;">${a.department || '-'}</td>
                        <td>${a.dob || '-'}</td>
                        <td>${a.mobile_number || '-'}<br><div style="display:flex; gap:8px; margin-top:4px;">${fb}${ig}</div></td>
                        <td>${leaveBadge}</td>
                        <td>
                            <div style="display:flex; gap:8px;">
                                <button class="btn btn-outline" style="padding: 6px 12px;" onclick="AdminApp.openEditMemberModal('${a.id}')"><i class="ph ph-pencil"></i></button>
                                <button class="btn btn-danger" style="padding: 6px 12px;" onclick="AdminApp.deleteMember('${a.id}')"><i class="ph ph-trash"></i></button>
                            </div>
                        </td>
                    </tr>`;
                });
                const tbody = document.getElementById('tableMembers');
                if (tbody) tbody.innerHTML = html || '<tr><td colspan="7" class="text-center text-muted">No members found.</td></tr>';
            },

            openAddMemberModal: () => {
                let prOptions = `<option value="">-- None --</option>`;
                AdminApp.prGroups.forEach(g => prOptions += `<option value="${g}">${g}</option>`);
                
                UI.showModal('Add New Member (Artist)', `
                    <form onsubmit="AdminApp.saveMember(event, null)">
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                            <div class="form-group"><label class="form-label">Name</label><input type="text" id="memName" class="form-control" required></div>
                            <div class="form-group"><label class="form-label">Nickname</label><input type="text" id="memNick" class="form-control"></div>
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                            <div class="form-group"><label class="form-label">Department (Comma separated)</label><input type="text" id="memDept" class="form-control" placeholder="e.g. Camera, Editing"></div>
                            <div class="form-group"><label class="form-label">Date of Birth</label><input type="date" id="memDob" class="form-control"></div>
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                            <div class="form-group"><label class="form-label">Mobile Number</label><input type="tel" id="memMobile" class="form-control"></div>
                            <div class="form-group"><label class="form-label">PR Group</label><select id="memPrGroup" class="form-control">${prOptions}</select></div>
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                            <div class="form-group"><label class="form-label">Facebook Username/URL</label><input type="text" id="memFb" class="form-control" placeholder="e.g. markzuckerberg"></div>
                            <div class="form-group"><label class="form-label">Instagram Username/URL</label><input type="text" id="memIg" class="form-control" placeholder="e.g. cristiano"></div>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width:100%; margin-top: 16px;">Save Member</button>
                    </form>
                `);
            },
            
            openEditMemberModal: async (id) => {
                const artists = await DB.get('artists') || [];
                const a = artists.find(x => x && x.id === id);
                if(!a) return;
                
                let prOptions = `<option value="">-- None --</option>`;
                AdminApp.prGroups.forEach(g => {
                    const sel = a.pr_group === g ? 'selected' : '';
                    prOptions += `<option value="${g}" ${sel}>${g}</option>`;
                });
                
                UI.showModal('Edit Member', `
                    <form onsubmit="AdminApp.saveMember(event, '${id}')">
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                            <div class="form-group"><label class="form-label">Name</label><input type="text" id="memName" class="form-control" value="${a.name || ''}" required></div>
                            <div class="form-group"><label class="form-label">Nickname</label><input type="text" id="memNick" class="form-control" value="${a.nickname || ''}"></div>
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                            <div class="form-group"><label class="form-label">Department (Comma separated)</label><input type="text" id="memDept" class="form-control" value="${a.department || ''}"></div>
                            <div class="form-group"><label class="form-label">Date of Birth</label><input type="date" id="memDob" class="form-control" value="${a.dob || ''}"></div>
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                            <div class="form-group"><label class="form-label">Mobile Number</label><input type="tel" id="memMobile" class="form-control" value="${a.mobile_number || ''}"></div>
                            <div class="form-group"><label class="form-label">PR Group</label><select id="memPrGroup" class="form-control">${prOptions}</select></div>
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                            <div class="form-group"><label class="form-label">Facebook Username/URL</label><input type="text" id="memFb" class="form-control" value="${a.facebook || ''}" placeholder="e.g. markzuckerberg"></div>
                            <div class="form-group"><label class="form-label">Instagram Username/URL</label><input type="text" id="memIg" class="form-control" value="${a.instagram || ''}" placeholder="e.g. cristiano"></div>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width:100%; margin-top: 16px;">Update Member</button>
                    </form>
                `);
            },
            
            saveMember: async (e, id) => {
                e.preventDefault();
                const btn = e.target.querySelector('button');
                const origHtml = btn.innerHTML;
                btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Saving...';
                btn.disabled = true;

                const payload = {
                    name: document.getElementById('memName').value,
                    nickname: document.getElementById('memNick').value,
                    department: document.getElementById('memDept').value,
                    dob: document.getElementById('memDob').value || null,
                    mobile_number: document.getElementById('memMobile').value,
                    pr_group: document.getElementById('memPrGroup').value || null,
                    facebook: document.getElementById('memFb').value,
                    instagram: document.getElementById('memIg').value
                };
                
                try {
                    if (id) {
                        await DB.update('artists', id, payload);
                        UI.showToast('Member updated.', 'success');
                    } else {
                        payload.id = crypto.randomUUID(); 
                        await DB.insert('artists', payload);
                        UI.showToast('Member added.', 'success');
                    }
                    UI.closeModal();
                    AdminApp.initMembersTab(); 
                } catch(err) {
                    UI.showToast(`Error saving member: ${err.message}`, 'error');
                    btn.innerHTML = origHtml;
                    btn.disabled = false;
                }
            },
            
            deleteMember: (id) => {
                UI.confirm('Delete Member', 'Are you sure you want to delete this member? All their data will be lost.', async () => {
                    await DB.remove('artists', id);
                    UI.showToast('Member deleted.', 'success');
                    AdminApp.initMembersTab();
                });
            },

            // --- FB PAGE INVITE TRACKING ---
            loadInvites: async () => {
                const dateEl = document.getElementById('inviteDate');
                const date = dateEl ? dateEl.value : '';
                const tbody = document.getElementById('tableInvites');
                if (!date || !tbody) return;

                tbody.innerHTML = '<tr><td colspan="5" class="text-center"><i class="ph ph-spinner ph-spin"></i> Loading...</td></tr>';

                if (!AdminApp.cachedArtists || AdminApp.cachedArtists.length === 0) {
                    AdminApp.cachedArtists = await DB.get('artists') || [];
                }
                const trackingRecords = await DB.get('page_invite_tracking') || [];
                const todaysRecords = trackingRecords.filter(r => r && r.assignment_date === date);

                let html = '';
                AdminApp.cachedArtists.forEach(a => {
                    if (!a) return;
                    const rec = todaysRecords.find(r => r.artist_id === a.id);
                    const status = rec ? rec.status : 'Pending';
                    const recId = rec ? rec.id : null;

                    const isDone = status === 'Done';
                    const btnClass = isDone ? 'btn-outline' : 'btn-success';
                    const btnText = isDone ? '<i class="ph-bold ph-x"></i> Mark Pending' : '<i class="ph-bold ph-check"></i> Mark Done';
                    
                    const badgeClass = isDone ? 'badge-completed' : 'badge-pending';
                    const badgeText = isDone ? '🟢 Done' : '🟡 Pending';

                    html += `<tr>
                        <td><strong>${a.name}</strong><br><small style="color:var(--text-muted);">${(a.id||'').substring(0,6).toUpperCase()}</small></td>
                        <td>${a.department || '-'}</td>
                        <td><span style="font-weight:600; color:var(--gold);">${a.pr_group || 'Unassigned'}</span></td>
                        <td>
                            <button class="btn ${btnClass} btn-sm" style="padding: 4px 12px; font-size: 12px;" onclick="AdminApp.toggleInviteStatus('${a.id}', '${status}', '${recId}')">
                                ${btnText}
                            </button>
                        </td>
                        <td><span class="badge ${badgeClass}" style="font-size: 13px; padding: 6px 12px;">${badgeText}</span></td>
                    </tr>`;
                });

                tbody.innerHTML = html || '<tr><td colspan="5" class="text-center text-muted">No members found.</td></tr>';
            },

            toggleInviteStatus: async (artistId, currentStatus, recId) => {
                const newStatus = currentStatus === 'Pending' ? 'Done' : 'Pending';
                const dateEl = document.getElementById('inviteDate');
                const date = dateEl ? dateEl.value : todayStr();
                
                if (recId && recId !== 'null' && recId !== 'undefined') {
                    await DB.update('page_invite_tracking', recId, { status: newStatus });
                } else {
                    await DB.insert('page_invite_tracking', { artist_id: artistId, assignment_date: date, status: newStatus });
                }
                
                UI.showToast(`Artist marked as ${newStatus}!`);
                AdminApp.loadInvites();
            },

            exportInvitePDF: async () => {
    if (!window.jspdf) return UI.showToast("PDF Library loading...", "warning");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const dateEl = document.getElementById('inviteDate');
    const date = dateEl ? dateEl.value : todayStr(); // Ensure todayStr() is defined in your utils

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // ==========================================
    // 1. OFFICIAL LETTERHEAD DESIGN (PAD THEME)
    // ==========================================
    
    // Top Dark Charcoal Banner
    doc.setFillColor(14, 26, 54); 
    doc.rect(0, 0, pageWidth, 35, 'F');
    
    // Gold Accent Line under the banner
    doc.setFillColor(212, 175, 55); // Gold color
    doc.rect(0, 35, pageWidth, 2, 'F');

    // Main Brand Title
    doc.setTextColor(212, 175, 55); // Gold Text
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.text("CHINNAPATRA", pageWidth / 2, 22, { align: "center" });

    // Subtitle (Public Relations Dept)
    doc.setTextColor(220, 220, 220); // Light Gray
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("PUBLIC RELATIONS & COMMUNICATIONS DESK", pageWidth / 2, 30, { align: "center" });

    // ==========================================
    // 2. DOCUMENT META DATA
    // ==========================================
    
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Facebook Page Invite & Share Status", 14, 52);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Assignment Date: ${date}`, 14, 58);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 63);

    // ==========================================
    // 3. SUBTLE WATERMARK BACKGROUND
    // ==========================================
    
    doc.setTextColor(245, 245, 245); // Very light, almost invisible gray
    doc.setFontSize(60);
    doc.setFont("helvetica", "bolditalic");
    // Draws a large angled watermark in the center of the page
    doc.text("CHINNAPATRA", pageWidth / 2, pageHeight / 2 + 20, { 
        align: "center", 
        angle: 45 
    });

    // ==========================================
    // 4. PREPARE DATA
    // ==========================================
    
    const trackingRecords = await DB.get('page_invite_tracking') || [];
    const todaysRecords = trackingRecords.filter(r => r && r.assignment_date === date);
    
    let body = [];
    (AdminApp.cachedArtists || []).forEach(a => {
        if (!a) return;
        const rec = todaysRecords.find(r => r.artist_id === a.id);
        const status = rec ? rec.status : 'Pending';
        body.push([a.name, a.pr_group || 'Unassigned', status]);
    });

    // Sort by status (Done vs Pending)
    body.sort((a, b) => a[2].localeCompare(b[2]));

    // ==========================================
    // 5. STYLISH DATA TABLE
    // ==========================================
    
    doc.autoTable({
        startY: 70,
        head: [["Artist Name", "PR Group", "Invite Status"]],
        body: body,
        theme: 'grid',
        styles: { 
            font: 'helvetica',
            fontSize: 10, 
            cellPadding: 6,
            lineColor: [230, 230, 230],
            lineWidth: 0.1,
        },
        headStyles: { 
            fillColor: [14, 26, 54], // Dark charcoal header
            textColor: [212, 175, 55], // Gold text
            fontStyle: "bold",
            halign: 'center'
        },
        columnStyles: {
            0: { fontStyle: 'bold', textColor: [60, 60, 60] },
            2: { halign: 'center', fontStyle: 'bold' } // Center align the status
        },
        alternateRowStyles: {
            fillColor: [250, 250, 250] // Very subtle gray for readability
        },
        didParseCell: function(data) {
            // Apply custom colors based on status in the 3rd column
            if (data.section === 'body' && data.column.index === 2) {
                if (data.cell.raw === 'Done') {
                    data.cell.styles.textColor = [16, 185, 129]; // Emerald Green text
                    data.cell.styles.fillColor = [236, 253, 245]; // Soft green background
                } else if (data.cell.raw === 'Pending') {
                    data.cell.styles.textColor = [245, 158, 11]; // Amber text
                    data.cell.styles.fillColor = [255, 251, 235]; // Soft amber background
                }
            }
        },
        // Adds the bottom border and footer to every generated page
        didDrawPage: function (data) {
            // Subtle Gold Footer Line
            doc.setFillColor(212, 175, 55);
            doc.rect(0, pageHeight - 15, pageWidth, 0.5, 'F');
            
            // Footer Text
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(
                `Chinnapatra PR Management System  |  Page ${doc.internal.getNumberOfPages()}`, 
                pageWidth / 2, 
                pageHeight - 8, 
                { align: "center" }
            );
        }
    });

    // ==========================================
    // 6. EXPORT
    // ==========================================
    
    doc.save(`Chinnapatra_Invites_${date}.pdf`);
    UI.showToast("Stylish Official Invite PDF generated successfully!");
},
            
            // --- PR GROUP ACTIVITY TRACKING ---
            prActivityState: {},
            
            initPRActivityTab: async () => {
                const artists = await DB.get('artists') || [];
                AdminApp.cachedArtists = artists;

                let prOptions = `<option value="">-- Select PR Group --</option>`;
                AdminApp.prGroups.forEach(grp => { prOptions += `<option value="${grp}">${grp}</option>`; });
                const filterGrpEl = document.getElementById('filterPRGroup');
                if (filterGrpEl) filterGrpEl.innerHTML = prOptions;
                
                const dateInput = document.getElementById('prActivityDate');
                if(dateInput && !dateInput.value) dateInput.value = todayStr();
                
                AdminApp.loadPRGroupMembers();
            },

            loadPRGroupMembers: async () => {
                const prGrpEl = document.getElementById('filterPRGroup');
                const dateEl = document.getElementById('prActivityDate');
                const prGroupName = prGrpEl ? prGrpEl.value : '';
                const date = dateEl ? dateEl.value : '';
                const tbody = document.getElementById('tablePRGroupActivity');

                if (!tbody) return;

                if (!prGroupName || !date) {
                    tbody.innerHTML = '<tr><td colspan="4" class="text-center"><i class="ph-fill ph-users text-success" style="font-size:32px;"></i><br><strong style="color:var(--primary); font-size:16px;">Please select a PR Group & Date</strong></td></tr>';
                    return;
                }

                tbody.innerHTML = '<tr><td colspan="4" class="text-center"><i class="ph ph-spinner ph-spin"></i> Loading members...</td></tr>';

                const activities = await DB.get('pr_group_activities') || [];
                const todaysAct = activities.filter(a => a && a.pr_id === prGroupName && a.activity_date === date);
                const groupArtists = (AdminApp.cachedArtists || []).filter(a => a && a.pr_group === prGroupName);

                AdminApp.prActivityState = {};

                if(groupArtists.length === 0) {
                     tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No artists assigned to this PR Group.</td></tr>';
                     return;
                }

                groupArtists.forEach(a => {
                    const existing = todaysAct.find(act => act.artist_id === a.id);
                    AdminApp.prActivityState[a.id] = {
                        artist: a,
                        id: existing ? existing.id : null,
                        liked: existing ? existing.liked : false,
                        commented: existing ? existing.commented : false,
                        shared: existing ? existing.shared : false,
                        activeness: existing ? existing.activeness_status : 'Active'
                    };
                });

                AdminApp.renderPRTableFromState();
            },

            renderPRTableFromState: () => {
                const tbody = document.getElementById('tablePRGroupActivity');
                if (!tbody) return;
                let html = '';

                Object.values(AdminApp.prActivityState).forEach(s => {
                    const a = s.artist;
                    
                    const likeBtn = s.liked ? 'btn-success' : 'btn-outline';
                    const commBtn = s.commented ? 'btn-success' : 'btn-outline';
                    const shareBtn = s.shared ? 'btn-success' : 'btn-outline';
                    
                    const likeIcon = s.liked ? 'ph-fill' : 'ph-bold';
                    const commIcon = s.commented ? 'ph-fill' : 'ph-bold';
                    const shareIcon = s.shared ? 'ph-fill' : 'ph-bold';

                    const activeBtn = s.activeness === 'Active' 
                        ? 'background: rgba(16, 185, 129, 0.1); color: var(--success); border: 1px solid var(--success);'
                        : 'background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid var(--danger);';
                    const activeIcon = s.activeness === 'Active' ? 'ph-check-circle' : 'ph-x-circle';

                    html += `<tr>
                        <td><strong>${a.name}</strong><br><small style="color:var(--text-muted);">${a.nickname || ''}</small></td>
                        <td><span style="font-size:12px; font-weight:600; color:var(--gold);">${a.department || '-'}</span></td>
                        <td>
                            <div style="display:flex; gap:8px;">
                                <button class="btn ${likeBtn} btn-sm" style="padding: 4px 10px; font-size: 12px; transition: none;" onclick="AdminApp.togglePRTask('${a.id}', 'liked')"><i class="${likeIcon} ph-thumbs-up"></i> Like</button>
                                <button class="btn ${commBtn} btn-sm" style="padding: 4px 10px; font-size: 12px; transition: none;" onclick="AdminApp.togglePRTask('${a.id}', 'commented')"><i class="${commIcon} ph-chat-circle"></i> Comment</button>
                                <button class="btn ${shareBtn} btn-sm" style="padding: 4px 10px; font-size: 12px; transition: none;" onclick="AdminApp.togglePRTask('${a.id}', 'shared')"><i class="${shareIcon} ph-share-network"></i> Share</button>
                            </div>
                        </td>
                        <td>
                            <button class="btn ripple-btn" style="padding: 6px 12px; font-size: 12px; min-width: 90px; transition: none; ${activeBtn}" onclick="AdminApp.togglePRActiveness('${a.id}')">
                                <i class="ph-bold ${activeIcon}"></i> <span>${s.activeness}</span>
                            </button>
                        </td>
                    </tr>`;
                });

                tbody.innerHTML = html;
            },

            togglePRTask: (artistId, taskType) => {
                if (AdminApp.prActivityState[artistId]) {
                    AdminApp.prActivityState[artistId][taskType] = !AdminApp.prActivityState[artistId][taskType];
                    AdminApp.renderPRTableFromState(); 
                }
            },

            togglePRActiveness: (artistId) => {
                if (AdminApp.prActivityState[artistId]) {
                    const curr = AdminApp.prActivityState[artistId].activeness;
                    AdminApp.prActivityState[artistId].activeness = curr === 'Active' ? 'Inactive' : 'Active';
                    AdminApp.renderPRTableFromState();
                }
            },

            saveAllPRActivities: async () => {
                const prGroupEl = document.getElementById('filterPRGroup');
                const dateEl = document.getElementById('prActivityDate');
                const prGroupName = prGroupEl ? prGroupEl.value : '';
                const date = dateEl ? dateEl.value : '';
                if (!prGroupName || !date) return UI.showToast('Please select a PR Group and Date first.', 'error');

                const btn = document.querySelector('#admin-pr-activity .card-header .btn-primary');
                const origText = btn ? btn.innerHTML : '';
                if (btn) {
                    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Saving...';
                    btn.disabled = true;
                }

                const states = Object.values(AdminApp.prActivityState);
                
                await Promise.all(states.map(async (s) => {
                    const payload = {
                        pr_id: prGroupName,
                        artist_id: s.artist.id,
                        activity_date: date,
                        liked: s.liked,
                        commented: s.commented,
                        shared: s.shared,
                        activeness_status: s.activeness
                    };
                    
                    if (s.id) {
                        await DB.update('pr_group_activities', s.id, payload);
                    } else {
                        const res = await DB.insert('pr_group_activities', payload);
                        if (res) s.id = res.id; 
                    }
                }));

                UI.showToast('All PR Group Activities Saved!', 'success');
                if (btn) {
                    btn.innerHTML = origText;
                    btn.disabled = false;
                }
            },

            // --- MANAGE PR GROUP MEMBERS ---
            openManagePRGroupModal: () => {
                let options = `<option value="">-- Select PR Group --</option>`;
                AdminApp.prGroups.forEach(g => { options += `<option value="${g}">${g}</option>`; });
                
                UI.showModal('Manage PR Group Members', `
                    <div class="form-group">
                        <label class="form-label">Select PR Group</label>
                        <select id="managePRGroupSelect" class="form-control" onchange="AdminApp.loadManagePRGroupArtists()">${options}</select>
                    </div>
                    <div id="managePRGroupList" style="max-height: 300px; overflow-y: auto; border: 1.5px solid rgba(10, 25, 49, 0.1); border-radius: var(--radius-md); padding: 12px; margin-bottom: 16px; background: #f9f9f9; display:none;">
                        <!-- Artists loaded here -->
                    </div>
                    <button class="btn btn-primary" style="width: 100%;" onclick="AdminApp.savePRGroupMembers()">Save Assignments</button>
                `);
            },

            loadManagePRGroupArtists: () => {
                const selectEl = document.getElementById('managePRGroupSelect');
                const group = selectEl ? selectEl.value : '';
                const container = document.getElementById('managePRGroupList');
                if (!container) return;
                if (!group) { container.style.display = 'none'; return; }
                
                container.style.display = 'block';
                let html = `<div style="margin-bottom: 8px; font-weight: bold; color: var(--primary);">Assign Artists to ${group}</div>`;
                
                (AdminApp.cachedArtists || []).forEach(a => {
                    if (!a) return;
                    const checked = (a.pr_group === group) ? 'checked' : '';
                    html += `
                        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; cursor: pointer; padding: 4px; border-radius: 4px;" onmouseover="this.style.background='#eee'" onmouseout="this.style.background='transparent'">
                            <input type="checkbox" class="manage-pr-artist-cb" value="${a.id}" ${checked} style="width: 16px; height: 16px;"> 
                            <span style="font-size: 14px;">${a.name} <small style="color:var(--text-muted);">(${a.department || 'No Dept'})</small></span>
                        </label>
                    `;
                });
                container.innerHTML = html;
            },

            savePRGroupMembers: async () => {
                const selectEl = document.getElementById('managePRGroupSelect');
                const group = selectEl ? selectEl.value : '';
                if (!group) return UI.showToast('Please select a PR Group first', 'error');

                const checkboxes = document.querySelectorAll('.manage-pr-artist-cb');
                const selectedIds = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);

                for (let a of (AdminApp.cachedArtists || [])) {
                    if (!a) continue;
                    if (selectedIds.includes(a.id)) {
                        if (a.pr_group !== group) {
                            await DB.update('artists', a.id, { pr_group: group });
                            a.pr_group = group;
                        }
                    } else {
                        if (a.pr_group === group) {
                            await DB.update('artists', a.id, { pr_group: null });
                            a.pr_group = null;
                        }
                    }
                }
                
                UI.showToast(`${group} members updated!`, 'success');
                UI.closeModal();
                const prActTab = document.getElementById('admin-pr-activity');
                if(prActTab && prActTab.classList.contains('active')) AdminApp.loadPRGroupMembers();
            },

            // --- WEEKLY PR STATUS REPORT ---
           // --- WEEKLY PR STATUS REPORT ---
            prReportState: { active: [], inactive: [], onLeave: [] },

            openPRWeeklyReportModal: () => {
                let options = `<option value="">-- Select PR Group --</option>`;
                AdminApp.prGroups.forEach(g => { options += `<option value="${g}">${g}</option>`; });

                UI.showModal(`Weekly PR Group Status`, `
                    <div style="background: #F8FAFC; border: 1.5px solid rgba(10, 25, 49, 0.1); border-radius: 12px; padding: 24px; font-family: var(--font-main);">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <h3 style="font-family: var(--font-heading); color: var(--primary); font-size: 20px; letter-spacing: 1px;">📋 PR GROUP ARTIST STATUS</h3>
                            <div style="height: 2px; width: 100px; background: var(--gold); margin: 8px auto;"></div>
                        </div>
                        <div style="display: grid; grid-template-columns: 140px 1fr; gap: 12px; align-items: center; background: var(--white); padding: 16px; border-radius: 8px; box-shadow: var(--shadow-sm); margin-bottom: 20px;">
                            <strong style="font-size: 13px; color: var(--text-muted);">*PR GROUP:*</strong> 
                            <select id="repPRGrp" class="form-control" onchange="AdminApp.loadPRWeeklyReportData()" style="padding: 6px; font-weight: bold; color: var(--primary);">${options}</select>
                            <strong style="font-size: 13px; color: var(--text-muted);">*REPORTED BY:*</strong> 
                            <div style="font-weight: bold; color: var(--primary); font-size: 14px;">${App.currentUser ? App.currentUser.full_name : 'Admin'}</div>
                            <strong style="font-size: 13px; color: var(--text-muted);">*REPORT DATE:*</strong> 
                            <input type="date" id="repPRDate" class="form-control" value="${todayStr()}" onchange="AdminApp.loadPRWeeklyReportData()" style="padding: 6px; font-weight: bold; color: var(--primary);">
                        </div>
                        <div id="prReportDataArea" style="display: none; animation: fadeIn 0.4s ease;">
                            
                            <div style="background: rgba(16, 185, 129, 0.05); border-left: 4px solid var(--success); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                                    <strong style="color: var(--success); font-size: 15px;">🟢 Active Members:</strong>
                                    <small style="color: var(--text-muted);">Click to mark Inactive 👇</small>
                                </div>
                                <div id="repPRActiveContainer" style="display: flex; flex-wrap: wrap; gap: 8px;"></div>
                            </div>
                            
                            <div style="background: rgba(239, 68, 68, 0.05); border-left: 4px solid var(--danger); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                                    <strong style="color: var(--danger); font-size: 15px;">🔴 Inactive Members:</strong>
                                    <small style="color: var(--text-muted);">Click to mark On Leave 👇</small>
                                </div>
                                <div id="repPRInactiveContainer" style="display: flex; flex-wrap: wrap; gap: 8px;"></div>
                            </div>

                            <div style="background: rgba(245, 158, 11, 0.05); border-left: 4px solid var(--warning); padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                                    <strong style="color: var(--warning); font-size: 15px;">🟡 On Leave (ছুটিতে):</strong>
                                    <small style="color: var(--text-muted);">Click to mark Active 👆</small>
                                </div>
                                <div id="repPRLeaveContainer" style="display: flex; flex-wrap: wrap; gap: 8px;"></div>
                            </div>

                            <div style="background: var(--primary); color: var(--white); padding: 16px; border-radius: 8px; font-size: 14px; margin-bottom: 20px; box-shadow: var(--shadow-md);">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span>○ No. Of Active Member:</span> <strong id="cntPRActive" style="color: var(--success); font-size: 16px;">0</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span>○ No. Of On Leave Member:</span> <strong id="cntPRLeave" style="color: var(--warning); font-size: 16px;">0</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
                                    <span>○ No. Of Inactive Member:</span> <strong id="cntPRInactive" style="color: var(--danger); font-size: 16px;">0</strong>
                                </div>
                            </div>
                            <button id="btnSubmitPRReport" class="btn btn-primary ripple-btn" style="width: 100%; font-size: 16px; padding: 14px;" onclick="AdminApp.submitPRWeeklyReport()">
                                <i class="ph-bold ph-floppy-disk"></i> Submit Status & Apply +5 Pts
                            </button>
                        </div>
                    </div>
                `);
            },

            loadPRWeeklyReportData: async () => {
                const grpEl = document.getElementById('repPRGrp');
                const dateEl = document.getElementById('repPRDate');
                const grp = grpEl ? grpEl.value : '';
                const date = dateEl ? dateEl.value : '';
                const dataArea = document.getElementById('prReportDataArea');

                if (!dataArea) return;
                if (!grp) { dataArea.style.display = 'none'; return; }
                dataArea.style.display = 'block';

                AdminApp.prReportState = { active: [], inactive: [], onLeave: [] };
                const activities = await DB.get('pr_group_activities') || [];
                const groupArtists = (AdminApp.cachedArtists || []).filter(a => a && a.pr_group === grp);

                groupArtists.forEach(a => {
                    const isOnLeave = (AdminApp.cachedMemberLeaves || []).find(l => l && l.status === 'Approved' && l.member_name.startsWith(a.name) && date >= l.leave_from && date <= l.leave_to);
                    const myActs = activities.filter(act => act && act.artist_id === a.id && act.pr_id === grp);
                    myActs.sort((x,y) => new Date(y.created_at) - new Date(x.created_at));
                    const currentStatus = myActs.length > 0 ? myActs[0].activeness_status : 'Active';

                    if (isOnLeave || currentStatus === 'On Leave') AdminApp.prReportState.onLeave.push(a);
                    else if (currentStatus === 'Inactive') AdminApp.prReportState.inactive.push(a);
                    else AdminApp.prReportState.active.push(a);
                });

                AdminApp.renderPRReportUI();
            },

            movePRReportArtist: (artistId, targetList) => {
                const artist = (AdminApp.cachedArtists || []).find(a => a && a.id === artistId);
                if (!artist) return;
                
                // Remove from all lists
                AdminApp.prReportState.active = AdminApp.prReportState.active.filter(a => a.id !== artistId);
                AdminApp.prReportState.inactive = AdminApp.prReportState.inactive.filter(a => a.id !== artistId);
                AdminApp.prReportState.onLeave = AdminApp.prReportState.onLeave.filter(a => a.id !== artistId);
                
                // Add to target list
                AdminApp.prReportState[targetList].push(artist);
                AdminApp.renderPRReportUI();
            },

            renderPRReportUI: () => {
                const activeHtml = AdminApp.prReportState.active.map(a => `
                    <div onclick="AdminApp.movePRReportArtist('${a.id}', 'inactive')" style="background: var(--white); color: var(--success); border: 1px solid var(--success); padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 4px rgba(16, 185, 129, 0.1); display: flex; align-items: center; gap: 6px;" onmouseover="this.style.background='var(--danger)'; this.style.color='white'" onmouseout="this.style.background='var(--white)'; this.style.color='var(--success)'" title="Move to Inactive">
                        <i class="ph-fill ph-check-circle"></i> ${a.name}
                    </div>
                `).join('');

                const inactiveHtml = AdminApp.prReportState.inactive.map(a => `
                    <div onclick="AdminApp.movePRReportArtist('${a.id}', 'onLeave')" style="background: var(--white); color: var(--danger); border: 1px solid var(--danger); padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 4px rgba(239, 68, 68, 0.1); display: flex; align-items: center; gap: 6px;" onmouseover="this.style.background='var(--warning)'; this.style.color='white'" onmouseout="this.style.background='var(--white)'; this.style.color='var(--danger)'" title="Move to On Leave">
                        <i class="ph-fill ph-x-circle"></i> ${a.name}
                    </div>
                `).join('');

                const leaveHtml = AdminApp.prReportState.onLeave.map(a => `
                    <div onclick="AdminApp.movePRReportArtist('${a.id}', 'active')" style="background: var(--warning); color: var(--white); border: 1px solid var(--warning); padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 4px rgba(245, 158, 11, 0.2); display: flex; align-items: center; gap: 6px;" onmouseover="this.style.background='var(--success)'; this.style.borderColor='var(--success)'" onmouseout="this.style.background='var(--warning)'; this.style.borderColor='var(--warning)'" title="Move to Active">
                        <i class="ph-fill ph-airplane-tilt"></i> ${a.name}
                    </div>
                `).join('');

                const activeContainer = document.getElementById('repPRActiveContainer');
                const inactiveContainer = document.getElementById('repPRInactiveContainer');
                const leaveContainer = document.getElementById('repPRLeaveContainer');

                if (activeContainer) activeContainer.innerHTML = activeHtml || '<em style="color:var(--text-muted); font-size:13px;">No active members.</em>';
                if (inactiveContainer) inactiveContainer.innerHTML = inactiveHtml || '<em style="color:var(--text-muted); font-size:13px;">No inactive members.</em>';
                if (leaveContainer) leaveContainer.innerHTML = leaveHtml || '<em style="color:var(--text-muted); font-size:13px;">No members on leave.</em>';

                const cntActive = document.getElementById('cntPRActive');
                const cntInactive = document.getElementById('cntPRInactive');
                const cntLeave = document.getElementById('cntPRLeave');

                if (cntActive) cntActive.innerText = AdminApp.prReportState.active.length;
                if (cntInactive) cntInactive.innerText = AdminApp.prReportState.inactive.length;
                if (cntLeave) cntLeave.innerText = AdminApp.prReportState.onLeave.length;
            },

            submitPRWeeklyReport: async () => {
                const grp = document.getElementById('repPRGrp').value;
                const date = document.getElementById('repPRDate').value;
                const btn = document.getElementById('btnSubmitPRReport');
                if (btn) {
                    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Submitting...';
                    btn.disabled = true;
                }

                const loggedByName = App.currentUser ? App.currentUser.full_name : 'Admin';
                
                // Load existing data so we can update instead of duplicate if submitting on same day
                const activities = await DB.get('pr_group_activities') || [];
                const artistActivities = await DB.get('artist_activities') || [];

                const insertActivity = async (artist, status, score) => {
                    
                    // 1. Update PR Group Activities Log
                    const existingPR = activities.find(act => act.artist_id === artist.id && act.pr_id === grp && act.activity_date === date);
                    if (existingPR) {
                        await DB.update('pr_group_activities', existingPR.id, { activeness_status: status });
                    } else {
                        await DB.insert('pr_group_activities', { pr_id: grp, artist_id: artist.id, activity_date: date, activeness_status: status });
                    }

                    // 2. Update Master Artist Points Log
                    const existingScore = artistActivities.find(l => l.artist_id === artist.id && l.activity_name === 'PR Group Activeness' && l.uploading_date === date);
                    const scorePayload = {
                        artist_id: artist.id, department: artist.department || 'PR Task', activity_name: 'PR Group Activeness',
                        uploading_date: date, status: status, auto_score: score, logged_by: loggedByName,
                        notes: `Weekly PR status update marked as ${status}`
                    };
                    
                    if (existingScore) {
                        await DB.update('artist_activities', existingScore.id, scorePayload);
                    } else {
                        await DB.insert('artist_activities', scorePayload);
                    }
                };

                for (let a of AdminApp.prReportState.active) { await insertActivity(a, 'Active', 5); }
                for (let a of AdminApp.prReportState.inactive) { await insertActivity(a, 'Inactive', 0); }
                for (let a of AdminApp.prReportState.onLeave) { await insertActivity(a, 'On Leave', 0); }

                UI.showToast('PR Group Status Submitted! Points updated successfully.', 'success');
                UI.closeModal();
                const prActTab = document.getElementById('admin-pr-activity');
                if(prActTab && prActTab.classList.contains('active')) AdminApp.loadPRGroupMembers();
            },

            // --- DEPARTMENT STATUS REPORT (DEPARTMENT WISE) ---
            reportState: { active: [], inactive: [], onLeave: [] },

            openDeptReportModal: async () => {
                if (!AdminApp.cachedArtists.length) AdminApp.cachedArtists = await DB.get('artists') || [];
                if (!AdminApp.cachedPRs.length) AdminApp.cachedPRs = (await DB.get('users') || []).filter(u => u.role === 'PR');
                if (!AdminApp.cachedMemberLeaves.length) AdminApp.cachedMemberLeaves = await DB.get('member_leave_requests') || [];
                if (!AdminApp.cachedActivities.length) AdminApp.cachedActivities = await DB.get('artist_activities') || [];

                let deptOptions = `<option value="">-- Select Department --</option>`;
                let allDepts = new Set();
                AdminApp.cachedArtists.forEach(a => { if (a && a.department) a.department.split(',').forEach(d => allDepts.add(d.trim())); });
                allDepts.forEach(d => { if(d) deptOptions += `<option value="${d}">${d}</option>`; });

                let prOptions = `<option value="">-- Select PR --</option>`;
                AdminApp.cachedPRs.forEach(pr => { prOptions += `<option value="${pr.pr_id}">${pr.full_name}</option>`; });

                UI.showModal(`Department Status Report`, `
                    <div style="background: #F8FAFC; border: 1.5px solid rgba(10, 25, 49, 0.1); border-radius: 12px; padding: 24px; font-family: var(--font-main);">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <h3 style="font-family: var(--font-heading); color: var(--primary); font-size: 20px; letter-spacing: 1px;">📋 CHINNAPATRA DEPARTMENT ARTIST STATUS</h3>
                            <div style="height: 2px; width: 100px; background: var(--gold); margin: 8px auto;"></div>
                        </div>
                        <div style="display: grid; grid-template-columns: 140px 1fr; gap: 12px; align-items: center; background: var(--white); padding: 16px; border-radius: 8px; box-shadow: var(--shadow-sm); margin-bottom: 20px;">
                            <strong style="font-size: 13px; color: var(--text-muted);">*DEPARTMENT:*</strong> 
                            <select id="repDept" class="form-control" onchange="AdminApp.loadDeptReportData()" style="padding: 6px; font-weight: bold; color: var(--primary);">${deptOptions}</select>
                            <strong style="font-size: 13px; color: var(--text-muted);">*REPORTED BY:*</strong> 
                            <select id="repReporter" class="form-control" style="padding: 6px; font-weight: bold; color: var(--primary);">${prOptions}</select>
                            <strong style="font-size: 13px; color: var(--text-muted);">*REPORT DATE:*</strong> 
                            <input type="date" id="repDate" class="form-control" value="${todayStr()}" onchange="AdminApp.loadDeptReportData()" style="padding: 6px; font-weight: bold; color: var(--primary);">
                        </div>
                        <div id="reportDataArea" style="display: none; animation: fadeIn 0.4s ease;">
                            
                            <div style="background: rgba(16, 185, 129, 0.05); border-left: 4px solid var(--success); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                                    <strong style="color: var(--success); font-size: 15px;">🟢 Active Members:</strong>
                                    <small style="color: var(--text-muted);">Click to mark Inactive 👇</small>
                                </div>
                                <div id="repActiveContainer" style="display: flex; flex-wrap: wrap; gap: 8px;"></div>
                            </div>
                            
                            <div style="background: rgba(239, 68, 68, 0.05); border-left: 4px solid var(--danger); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                                    <strong style="color: var(--danger); font-size: 15px;">🔴 Inactive Members:</strong>
                                    <small style="color: var(--text-muted);">Click to mark On Leave 👇</small>
                                </div>
                                <div id="repInactiveContainer" style="display: flex; flex-wrap: wrap; gap: 8px;"></div>
                            </div>

                            <div style="background: rgba(245, 158, 11, 0.05); border-left: 4px solid var(--warning); padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                                    <strong style="color: var(--warning); font-size: 15px;">🟡 On Leave (ছুটিতে):</strong>
                                    <small style="color: var(--text-muted);">Click to mark Active 👆</small>
                                </div>
                                <div id="repLeaveContainer" style="display: flex; flex-wrap: wrap; gap: 8px;"></div>
                            </div>

                            <div style="background: var(--primary); color: var(--white); padding: 16px; border-radius: 8px; font-size: 14px; margin-bottom: 20px; box-shadow: var(--shadow-md);">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span>○ No. Of Active Member:</span> <strong id="cntActive" style="color: var(--success); font-size: 16px;">0</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span>○ No. Of On Leave Member:</span> <strong id="cntLeave" style="color: var(--warning); font-size: 16px;">0</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
                                    <span>○ No. Of Inactive Member:</span> <strong id="cntInactive" style="color: var(--danger); font-size: 16px;">0</strong>
                                </div>
                                <div style="border-top: 1px solid rgba(255,255,255,0.2); padding-top: 12px; font-size: 12px; color: var(--gold-light); display: flex; align-items: center; gap: 6px;">
                                    <i class="ph-bold ph-clock-counter-clockwise"></i> □ Last Update : <span id="repLastUpdate">Never updated</span>
                                </div>
                            </div>
                            <button id="btnSubmitReport" class="btn btn-primary ripple-btn" style="width: 100%; font-size: 16px; padding: 14px;" onclick="AdminApp.submitDeptReport()">
                                <i class="ph-bold ph-floppy-disk"></i> Submit Status & Apply +5 Pts
                            </button>
                        </div>
                    </div>
                `);
            },

            loadDeptReportData: () => {
                const repDeptEl = document.getElementById('repDept');
                const repDateEl = document.getElementById('repDate');
                const dept = repDeptEl ? repDeptEl.value : '';
                const date = repDateEl ? repDateEl.value : '';
                const dataArea = document.getElementById('reportDataArea');

                if (!dataArea) return;
                if (!dept) { dataArea.style.display = 'none'; return; }
                dataArea.style.display = 'block';

                AdminApp.reportState = { active: [], inactive: [], onLeave: [] };
                let lastUpdateTime = null;

                const deptLogs = (AdminApp.cachedActivities || []).filter(l => l && l.department === dept && l.activity_name === 'Weekly Activeness');
                if (deptLogs.length > 0) {
                    deptLogs.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
                    lastUpdateTime = deptLogs[0].created_at;
                }

                const deptArtists = (AdminApp.cachedArtists || []).filter(a => a && a.department && a.department.split(',').map(d=>d.trim()).includes(dept));

                deptArtists.forEach(a => {
                    const isOnLeave = (AdminApp.cachedMemberLeaves || []).find(l => l && l.status === 'Approved' && l.member_name.startsWith(a.name) && date >= l.leave_from && date <= l.leave_to);
                    const currentStatus = AdminApp.getDeptStatus(a.id, dept);

                    if (isOnLeave || currentStatus === 'On Leave') AdminApp.reportState.onLeave.push(a);
                    else if (currentStatus === 'Inactive') AdminApp.reportState.inactive.push(a);
                    else AdminApp.reportState.active.push(a);
                });

                const updateText = lastUpdateTime ? new Date(lastUpdateTime).toLocaleString([], {dateStyle: 'medium', timeStyle: 'short'}) : 'Never updated';
                const repLastUpdateEl = document.getElementById('repLastUpdate');
                if (repLastUpdateEl) repLastUpdateEl.innerText = updateText;

                AdminApp.renderReportUI();
            },

            moveReportArtist: (artistId, targetList) => {
                const artist = (AdminApp.cachedArtists || []).find(a => a && a.id === artistId);
                if (!artist) return;
                
                // Remove from all lists
                AdminApp.reportState.active = AdminApp.reportState.active.filter(a => a.id !== artistId);
                AdminApp.reportState.inactive = AdminApp.reportState.inactive.filter(a => a.id !== artistId);
                AdminApp.reportState.onLeave = AdminApp.reportState.onLeave.filter(a => a.id !== artistId);
                
                // Add to target
                AdminApp.reportState[targetList].push(artist);
                AdminApp.renderReportUI();
            },

            renderReportUI: () => {
                const activeHtml = AdminApp.reportState.active.map(a => `
                    <div onclick="AdminApp.moveReportArtist('${a.id}', 'inactive')" style="background: var(--white); color: var(--success); border: 1px solid var(--success); padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 4px rgba(46, 125, 50, 0.1); display: flex; align-items: center; gap: 6px;" onmouseover="this.style.background='var(--danger)'; this.style.color='white'" onmouseout="this.style.background='var(--white)'; this.style.color='var(--success)'" title="Move to Inactive">
                        <i class="ph-fill ph-check-circle"></i> ${a.name}
                    </div>
                `).join('');

                const inactiveHtml = AdminApp.reportState.inactive.map(a => `
                    <div onclick="AdminApp.moveReportArtist('${a.id}', 'onLeave')" style="background: var(--white); color: var(--danger); border: 1px solid var(--danger); padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 4px rgba(211, 47, 47, 0.1); display: flex; align-items: center; gap: 6px;" onmouseover="this.style.background='var(--warning)'; this.style.color='white'" onmouseout="this.style.background='var(--white)'; this.style.color='var(--danger)'" title="Move to On Leave">
                        <i class="ph-fill ph-x-circle"></i> ${a.name}
                    </div>
                `).join('');

                const leaveHtml = AdminApp.reportState.onLeave.map(a => `
                    <div onclick="AdminApp.moveReportArtist('${a.id}', 'active')" style="background: var(--warning); color: var(--white); border: 1px solid var(--warning); padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 4px rgba(245, 124, 0, 0.2); display: flex; align-items: center; gap: 6px;" onmouseover="this.style.background='var(--success)'; this.style.borderColor='var(--success)'" onmouseout="this.style.background='var(--warning)'; this.style.borderColor='var(--warning)'" title="Move to Active">
                        <i class="ph-fill ph-airplane-tilt"></i> ${a.name}
                    </div>
                `).join('');

                const activeContainer = document.getElementById('repActiveContainer');
                const inactiveContainer = document.getElementById('repInactiveContainer');
                const leaveContainer = document.getElementById('repLeaveContainer');

                if (activeContainer) activeContainer.innerHTML = activeHtml || '<em style="color:var(--text-muted); font-size:13px;">No active members.</em>';
                if (inactiveContainer) inactiveContainer.innerHTML = inactiveHtml || '<em style="color:var(--text-muted); font-size:13px;">No inactive members.</em>';
                if (leaveContainer) leaveContainer.innerHTML = leaveHtml || '<em style="color:var(--text-muted); font-size:13px;">No members on leave.</em>';

                const cntActive = document.getElementById('cntActive');
                const cntInactive = document.getElementById('cntInactive');
                const cntLeave = document.getElementById('cntLeave');

                if (cntActive) cntActive.innerText = AdminApp.reportState.active.length;
                if (cntInactive) cntInactive.innerText = AdminApp.reportState.inactive.length;
                if (cntLeave) cntLeave.innerText = AdminApp.reportState.onLeave.length;
            },

            submitDeptReport: async () => {
                const repDeptEl = document.getElementById('repDept');
                const repReporterEl = document.getElementById('repReporter');
                const repDateEl = document.getElementById('repDate');
                const dept = repDeptEl ? repDeptEl.value : '';
                const reporterId = repReporterEl ? repReporterEl.value : '';
                const repDate = repDateEl ? repDateEl.value : todayStr();
                
                if (!dept || !reporterId) {
                    return UI.showToast('Please select both Department and Reported By PR.', 'error');
                }

                const reporterName = (AdminApp.cachedPRs || []).find(p=>p && p.pr_id === reporterId)?.full_name || 'System';

                const btn = document.getElementById('btnSubmitReport');
                if (btn) {
                    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Submitting...';
                    btn.disabled = true;
                }

                const existingLogs = (AdminApp.cachedActivities || []).filter(l => l.department === dept && l.activity_name === 'Weekly Activeness' && l.uploading_date === repDate);

                const insertActivity = async (artist, status, score) => {
                    const existing = existingLogs.find(l => l.artist_id === artist.id);
                    
                    const payload = {
                        artist_id: artist.id,
                        department: dept,
                        activity_name: 'Weekly Activeness',
                        uploading_date: repDate,
                        status: status,
                        auto_score: score,
                        logged_by: reporterName,
                        notes: `Weekly status update marked as ${status}`
                    };

                    if (existing) {
                        await DB.update('artist_activities', existing.id, payload);
                    } else {
                        await DB.insert('artist_activities', payload);
                    }
                };

                for (let a of AdminApp.reportState.active) { await insertActivity(a, 'Active', 5); }
                for (let a of AdminApp.reportState.inactive) { await insertActivity(a, 'Inactive', 0); }
                for (let a of AdminApp.reportState.onLeave) { await insertActivity(a, 'On Leave', 0); }

                AdminApp.cachedActivities = await DB.get('artist_activities') || []; 
                UI.showToast('Department Report Submitted! Points updated successfully.', 'success');
                UI.closeModal();
                AdminApp.filterArtists();
            },

            // --- ARTIST TRACKING & PERFORMANCE (DEPARTMENT-WISE) ---
            renderArtistTracking: async () => {
                try {
                    const artists = await DB.get('artists') || [];
                    const users = await DB.get('users') || [];
                    const leaves = await DB.get('member_leave_requests') || [];
                    const activities = await DB.get('artist_activities') || [];
                    const prs = users.filter(u => u && u.role === 'PR');

                    AdminApp.cachedArtists = artists;
                    AdminApp.cachedPRs = prs;
                    AdminApp.cachedMemberLeaves = leaves;
                    AdminApp.cachedActivities = activities;

                    const deptSelect = document.getElementById('filterArtistDept');
                    if (deptSelect) { 
                        let allDepts = new Set();
                        artists.forEach(a => { if (a && a.department) { a.department.split(',').forEach(d => allDepts.add(d.trim())); } });
                        let deptHtml = '<option value="">-- Click to choose a department --</option>';
                        allDepts.forEach(d => { if(d) deptHtml += `<option value="${d}">${d}</option>`; });
                        deptSelect.innerHTML = deptHtml;
                    }

                    AdminApp.filterArtists();
                } catch(err) {
                    console.error("Error in renderArtistTracking:", err);
                    UI.showToast("Failed to load department tracking.", "error");
                }
            },
            
            getDeptStatus: (artistId, dept) => {
                if (!AdminApp.cachedActivities) return 'Active';
                const logs = AdminApp.cachedActivities.filter(l => l && l.artist_id === artistId && l.department === dept && l.activity_name === 'Weekly Activeness');
                if (logs.length === 0) return 'Active'; 
                logs.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
                return logs[0].status === 'Inactive' ? 'Inactive' : 'Active';
            },

            getDeptPerformance: (artistId, dept) => {
                if (!AdminApp.cachedActivities) return { logs: [], total: 0 };
                const deptLogs = AdminApp.cachedActivities.filter(l => l && l.artist_id === artistId && l.department === dept);
                if (deptLogs.length === 0) return { logs: [], total: 0 };
                const sum = deptLogs.reduce((acc, l) => acc + (parseInt(l.auto_score) || 0), 0);
                return { logs: deptLogs, total: sum };
            },

            filterArtists: () => {
                const deptSelect = document.getElementById('filterArtistDept');
                const selectedDept = deptSelect ? deptSelect.value : '';
                const tbody = document.getElementById('tableArtistsTracking');
                if (!tbody) return;
                
                if (!selectedDept) {
                    tbody.innerHTML = '<tr><td colspan="5" class="text-center"><i class="ph-fill ph-arrow-up text-gold" style="font-size:32px;"></i><br><strong style="color:var(--primary); font-size:16px;">Please select a department above</strong></td></tr>';
                    return;
                }

                const date = todayStr(); 
                let filtered = (AdminApp.cachedArtists || []).filter(a => a && a.department && a.department.split(',').map(d=>d.trim()).includes(selectedDept));

                let html = '';
                filtered.forEach(a => {
                    const onLeave = (AdminApp.cachedMemberLeaves || []).find(l => 
                        l && l.status === 'Approved' && l.member_name.startsWith(a.name) && date >= l.leave_from && date <= l.leave_to
                    );

                    const deptStatus = AdminApp.getDeptStatus(a.id, selectedDept);
                    
                    let statusUI = '';
                    if (onLeave) {
                        statusUI = `<span class="badge badge-pending" style="padding: 8px 12px; font-size: 13px;"><i class="ph-fill ph-airplane-tilt"></i> On Leave</span>`;
                    } else {
                        const isInactive = deptStatus === 'Inactive';
                        const badgeClass = isInactive ? 'badge-absent' : 'badge-completed';
                        const toggleText = isInactive ? 'Inactive' : 'Active';
                        statusUI = `<span class="badge ${badgeClass}" style="font-size: 13px; padding: 6px 16px;">${toggleText}</span>`;
                    }

                    const actLogs = (AdminApp.cachedActivities || []).filter(l => l && l.artist_id === a.id && l.department === selectedDept && l.activity_name === 'Weekly Activeness').sort((x,y) => new Date(y.created_at) - new Date(x.created_at));
                    let prName = actLogs.length > 0 ? actLogs[0].logged_by : '-- Unassigned --';
                    const reportedByDisplay = `<span style="font-size: 13px; font-weight: 500; color: var(--text-dark); background: rgba(10,25,49,0.05); padding: 4px 8px; border-radius: 4px;">${prName}</span>`;

                    const perfData = AdminApp.getDeptPerformance(a.id, selectedDept);
                    let barColor = 'var(--text-muted)';
                    let barWidth = '0%';
                    let barText = '0 Pts';

                    if (perfData.logs.length > 0) {
                        barWidth = `${Math.min(100, perfData.total)}%`;
                        barText = `${perfData.total} Pts`;
                        barColor = 'var(--success)';
                    }

                    const perfBarUI = `
                        <div style="font-size: 12px; font-weight: 500; color: var(--primary); margin-bottom: 4px;">Total Score: ${barText}</div>
                        <div class="perf-bar-wrapper">
                            <div class="perf-bar-fill" style="width: ${barWidth}; background: ${barColor};"></div>
                        </div>
                    `;

                    const perfBtn = `<button class="btn btn-outline ripple-btn" style="padding: 6px 12px; font-size: 13px; width: 100%;" onclick="AdminApp.openPerformanceModal('${a.id}', '${selectedDept}')"><i class="ph-bold ph-list-magnifying-glass"></i> View History</button>`;

                    html += `<tr>
                        <td><strong>${a.name}</strong><br><small style="color:var(--text-muted);">${a.nickname || ''}</small></td>
                        <td>${statusUI}</td>
                        <td>${reportedByDisplay}</td>
                        <td>${perfBarUI}</td>
                        <td>${perfBtn}</td>
                    </tr>`;
                });

                tbody.innerHTML = html || '<tr><td colspan="5" class="text-center text-muted">No artists found in this department.</td></tr>';
                setTimeout(() => { document.querySelectorAll('.perf-bar-fill').forEach(b => { const w = b.style.width; b.style.width = '0'; setTimeout(()=> b.style.width = w, 50); }); }, 100);
            },

            openPerformanceModal: (artistId, dept) => {
                const artist = (AdminApp.cachedArtists || []).find(a => a && a.id === artistId);
                if(!artist) return;
                const perfData = AdminApp.getDeptPerformance(artist.id, dept);

                let historyHtml = '<div style="max-height: 400px; overflow-y: auto; margin-bottom: 8px; padding-right: 8px;">';
                if(perfData.logs.length === 0) {
                    historyHtml += '<div style="text-align: center; padding: 20px; background: rgba(10,25,49,0.02); border-radius: 8px;"><p class="text-muted" style="font-size: 13px;">No history logged yet for this department.</p></div>';
                } else {
                    [...perfData.logs].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).forEach(log => {
                        const logDateStr = new Date(log.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                        const uploadDateStr = log.uploading_date ? new Date(log.uploading_date).toLocaleDateString() : 'N/A';
                        
                        let ratingColor = log.auto_score >= 5 ? 'var(--success)' : (log.auto_score > 0 ? 'var(--warning)' : 'var(--danger)');
                        
                        historyHtml += `
                            <div style="background: rgba(10, 25, 49, 0.03); border-radius: var(--radius-sm); padding: 16px; margin-bottom: 12px; border-left: 4px solid var(--gold);">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <strong style="font-size: 14px; color: var(--primary);"><i class="ph-fill ph-check-square"></i> ${log.activity_name || 'General Update'}</strong>
                                    <span style="font-size: 12px; font-weight: 700; color: ${ratingColor}; background: rgba(0,0,0,0.05); padding: 4px 8px; border-radius: 20px;">+${log.auto_score} Pts</span>
                                </div>
                                <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">
                                    <strong>Status:</strong> ${log.status || 'Completed'} | <strong>Upload Date:</strong> ${uploadDateStr}
                                </p>
                                ${log.notes ? `<p style="font-size: 14px; color: var(--text-dark); margin-bottom: 8px;">${log.notes}</p>` : ''}
                                <small style="color: var(--text-muted); font-size: 11px;"><i class="ph-fill ph-user-circle"></i> Logged by ${log.logged_by} on ${logDateStr}</small>
                            </div>
                        `;
                    });
                }
                historyHtml += '</div>';

                UI.showModal(`Performance History: ${artist.name} <br><small style="color:var(--gold); font-size:14px;">Dept: ${dept}</small>`, `
                    ${historyHtml}
                    <button class="btn btn-secondary" style="width: 100%; margin-top: 16px;" onclick="UI.closeModal()">Close Window</button>
                `);
            },

            exportPerformanceCSV: () => {
                const rows = [["Artist Name", "Department", "Current Status", "Total Performance Points", "Last Reported By"]];
                
                (AdminApp.cachedArtists || []).forEach(a => {
                    if (!a) return;
                    const depts = a.department ? a.department.split(',').map(d=>d.trim()) : [];
                    depts.forEach(dept => {
                        if(!dept) return;
                        const status = AdminApp.getDeptStatus(a.id, dept);
                        const perf = AdminApp.getDeptPerformance(a.id, dept).total;
                        const actLogs = (AdminApp.cachedActivities || []).filter(l => l && l.artist_id === a.id && l.department === dept && l.activity_name === 'Weekly Activeness').sort((x,y) => new Date(y.created_at) - new Date(x.created_at));
                        const prName = actLogs.length > 0 ? actLogs[0].logged_by : 'Unassigned';
                        rows.push([a.name, dept, status, perf, prName]);
                    });
                });

                const csvContent = "\uFEFF" + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
                const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = `Monthly_Artist_Performance_${todayStr()}.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                UI.showToast("Monthly Performance CSV Downloaded!", "success");
            },

            // --- ADMIN ATTENDANCE EDITING ---
            toLocalISOStr: (iso) => {
                if (!iso) return '';
                let d = new Date(iso);
                d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                return d.toISOString().slice(0, 16);
            },
            renderAttSessionRows: () => {
                const container = document.getElementById('editAttSessionsArea');
                if (!container) return;
                let html = '';
                AdminApp.editAttState.sessions.forEach((s, idx) => {
                    const inVal = AdminApp.toLocalISOStr(s.check_in);
                    const outVal = AdminApp.toLocalISOStr(s.check_out);
                    html += `
                        <div style="background: rgba(10, 25, 49, 0.03); padding: 12px; border-radius: 8px; margin-bottom: 12px; border-left: 3px solid var(--gold);">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <strong style="font-size: 13px;">Session #${idx + 1}</strong>
                                <i class="ph-bold ph-trash" style="color: var(--danger); cursor: pointer;" onclick="AdminApp.removeAttSessionRow(${idx})"></i>
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                                <div><label style="font-size: 11px; color: var(--text-muted);">Check In</label><input type="datetime-local" class="form-control" value="${inVal}" style="padding: 6px 10px; font-size: 13px;" onchange="AdminApp.updateTempSession(${idx}, 'in', this.value)"></div>
                                <div><label style="font-size: 11px; color: var(--text-muted);">Check Out</label><input type="datetime-local" class="form-control" value="${outVal}" style="padding: 6px 10px; font-size: 13px;" onchange="AdminApp.updateTempSession(${idx}, 'out', this.value)"></div>
                            </div>
                        </div>
                    `;
                });
                container.innerHTML = html;
            },
            updateTempSession: (idx, type, val) => {
                const isoVal = val ? new Date(val).toISOString() : null;
                if (type === 'in') AdminApp.editAttState.sessions[idx].check_in = isoVal;
                if (type === 'out') AdminApp.editAttState.sessions[idx].check_out = isoVal;
            },
            addAttSessionRow: () => { AdminApp.editAttState.sessions.push({ check_in: null, check_out: null }); AdminApp.renderAttSessionRows(); },
            removeAttSessionRow: (idx) => { AdminApp.editAttState.sessions.splice(idx, 1); AdminApp.renderAttSessionRows(); },
            
            openEditAttendanceModal: async (prId, date) => {
                const attendance = await DB.get("attendance") || [];
                const record = attendance.find(a => a && a.pr_id === prId && a.date === date);
                const users = await DB.get("users") || [];
                const pr = users.find(u => u && u.pr_id === prId) || {full_name: prId};

                AdminApp.editAttState = {
                    pr_id: prId, date: date, recordId: record ? record.id : null,
                    sessions: record ? JSON.parse(JSON.stringify(record.sessions || [])) : [],
                    work_summary: record ? (record.work_summary || '') : ''
                };

                UI.showModal(`Edit Attendance: ${pr.full_name}`, `
                    <div style="margin-bottom: 12px; color: var(--primary); font-weight: 600;">Date: ${date}</div>
                    <div id="editAttSessionsArea"></div>
                    <button class="btn btn-outline btn-sm" style="margin-bottom: 20px; width: 100%; border-style: dashed;" onclick="AdminApp.addAttSessionRow()"><i class="ph-bold ph-plus"></i> Add Session</button>
                    <div class="form-group"><label class="form-label">Work Summary</label><textarea id="editAttSummary" class="form-control" style="min-height: 80px;">${AdminApp.editAttState.work_summary}</textarea></div>
                    <button class="btn btn-primary" style="width:100%;" onclick="AdminApp.saveEditedAttendance(event)"><i class="ph-bold ph-floppy-disk"></i> Save Attendance</button>
                `);
                AdminApp.renderAttSessionRows();
            },
            saveEditedAttendance: async (e) => {
                e.preventDefault();
                const btn = e.target.closest('button');
                const origHtml = btn.innerHTML;
                btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Saving...';
                btn.disabled = true;

                const summary = document.getElementById('editAttSummary').value;
                const sessions = AdminApp.editAttState.sessions;
                let totalMinutes = 0;
                sessions.forEach(s => { if (s.check_in && s.check_out) { totalMinutes += Math.max(0, Math.floor((new Date(s.check_out) - new Date(s.check_in)) / 60000)); } });

                if (AdminApp.editAttState.recordId) {
                    await DB.update('attendance', AdminApp.editAttState.recordId, { sessions: sessions, total_minutes: totalMinutes, work_summary: summary });
                } else if(sessions.length > 0 || summary) {
                    await DB.insert('attendance', { pr_id: AdminApp.editAttState.pr_id, date: AdminApp.editAttState.date, sessions: sessions, total_minutes: totalMinutes, work_summary: summary });
                }

                UI.showToast('Attendance updated successfully.', 'success');
                UI.closeModal();
                AdminApp.renderAttendance(); 
            },

            // --- DASHBOARD CORE FUNCTIONS ---
            startRealtimeDashboard: () => {
                if (AdminApp.dashboardInterval) clearInterval(AdminApp.dashboardInterval);
                AdminApp.loadDashboard();
                AdminApp.dashboardInterval = setInterval(() => {
                    const dashView = document.getElementById('admin-dashboard');
                    if (dashView && dashView.classList.contains('active')) AdminApp.loadDashboard();
                }, 5000);
            },

            loadDashboard: async () => {
                const prs = (await DB.get('users') || []).filter(u => u && u.role === 'PR');
                const artists = await DB.get('artists') || [];
                const atts = (await DB.get('attendance') || []).filter(a => a && a.date === todayStr());
                const prLeaves = await DB.get('pr_leave_requests') || [];
                const memberLeaves = await DB.get('member_leave_requests') || [];
                
                const disabledPRs = prs.filter(pr => pr.status === 'Disabled').length;
                const pendingPrLeaves = prLeaves.filter(l => l && l.status === 'Pending').length;
                
                const prOnLeaveToday = prLeaves.filter(l => l && l.status === 'Approved' && todayStr() >= l.leave_from && todayStr() <= l.leave_to).length;
                const totalPrsOnLeave = prOnLeaveToday + disabledPRs;

                const pendingMemberLeaves = memberLeaves.filter(l => l && l.status === 'Pending').length;
                
                let working = 0, completed = 0, checkedInCount = 0;

                atts.forEach(a => {
                    const sessions = a.sessions || [];
                    if (sessions.length > 0) {
                        checkedInCount++;
                        const lastSession = sessions[sessions.length - 1];
                        if (lastSession.check_out === null) working++;
                        else completed++;
                    }
                });

                const absent = Math.max(0, prs.length - checkedInCount - totalPrsOnLeave);

                const statsGrid = document.getElementById('adminStatsGrid');
                if (statsGrid) {
                    statsGrid.innerHTML = `
                        <div class="stat-card"><div class="stat-icon primary"><i class="ph-fill ph-palette"></i></div><div class="stat-info"><h4>Total Members (Artists)</h4><p>${artists.length}</p></div></div>
                        <div class="stat-card"><div class="stat-icon primary"><i class="ph-fill ph-users-three"></i></div><div class="stat-info"><h4>Total PR Staff</h4><p>${prs.length}</p></div></div>
                        <div class="stat-card"><div class="stat-icon gold"><i class="ph-fill ph-clock-user"></i></div><div class="stat-info"><h4>Currently Working</h4><p>${working}</p></div></div>
                        <div class="stat-card"><div class="stat-icon success"><i class="ph-fill ph-check-circle"></i></div><div class="stat-info"><h4>Completed Today</h4><p>${completed}</p></div></div>
                        <div class="stat-card"><div class="stat-icon" style="background:rgba(239, 68, 68, 0.1); color:var(--danger);"><i class="ph-fill ph-x-circle"></i></div><div class="stat-info"><h4>Absent Today</h4><p>${absent}</p></div></div>
                        <div class="stat-card"><div class="stat-icon gold"><i class="ph-fill ph-calendar-blank"></i></div><div class="stat-info"><h4>PR Staff On Leave</h4><p>${totalPrsOnLeave}</p></div></div>
                        <div class="stat-card"><div class="stat-icon gold"><i class="ph-fill ph-calendar-minus"></i></div><div class="stat-info"><h4>Pending PR Leave Reqs</h4><p>${pendingPrLeaves}</p></div></div>
                        <div class="stat-card"><div class="stat-icon primary"><i class="ph-fill ph-users"></i></div><div class="stat-info"><h4>Pending Member Leave Reqs</h4><p>${pendingMemberLeaves}</p></div></div>
                    `;
                }

                let activityItems = [];
                atts.forEach(a => {
                    const pr = prs.find(p => p.pr_id === a.pr_id) || { full_name: 'Unknown' };
                    (a.sessions || []).forEach(s => {
                        if (s.check_in) activityItems.push({ time: new Date(s.check_in), pr_name: pr.full_name, pr_id: a.pr_id, action: 'Checked In', badge: '<span class="badge badge-working">Working</span>' });
                        if (s.check_out) activityItems.push({ time: new Date(s.check_out), pr_name: pr.full_name, pr_id: a.pr_id, action: 'Checked Out', badge: '<span class="badge badge-completed">Completed</span>' });
                    });
                });

                activityItems.sort((a, b) => b.time - a.time);

                let html = '';
                activityItems.slice(0, 5).forEach(act => {
                    const timeStr = act.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    html += `<tr><td>${timeStr}</td><td><strong>${act.pr_name}</strong><br><small>${act.pr_id}</small></td><td>${act.action}</td><td>${act.badge}</td></tr>`;
                });
                const activityTable = document.getElementById('adminRecentActivityTable');
                if (activityTable) {
                    const tbody = activityTable.querySelector('tbody');
                    if (tbody) tbody.innerHTML = html || '<tr><td colspan="4" class="text-center text-muted">No activity today</td></tr>';
                }
                App.renderBirthdayWidgets();
            },

            exportAttendanceCSV: async () => {
                const dateEl = document.getElementById("filterAttDate");
                let date = dateEl ? dateEl.value : "";
                if (!date) { date = todayStr(); }

                const btn = document.querySelector('#admin-attendance .card-header button');
                const origHtml = btn ? btn.innerHTML : '';
                if (btn) {
                    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Exporting...';
                    btn.disabled = true;
                }

                const attendance = await DB.get("attendance") || [];
                const users = await DB.get("users") || [];
                const leaves = await DB.get("pr_leave_requests") || [];
                
                const atts = attendance.filter(a => a && a.date === date);
                const prs = users.filter(u => u && u.role === "PR");

                const rows = [["PR ID", "Name", "Date", "Sessions (In-Out)", "Total Hours", "Status", "Work Summary / Description"]];

                prs.forEach(p => {
                    const record = atts.find(a => a.pr_id === p.pr_id);
                    const onLeave = leaves.find(l => l && l.pr_id === p.pr_id && l.status === "Approved" && date >= l.leave_from && date <= l.leave_to) || p.status === 'Disabled';

                    if (!record) {
                        rows.push([ p.pr_id, p.full_name, date, "-", "-", onLeave ? "On Leave" : "Absent", "-" ]);
                    } else {
                        const sessions = record.sessions || [];
                        let sessionText = "-";
                        if (sessions.length) {
                            sessionText = sessions.map((s, i) => {
                                const inTime = s.check_in ? new Date(s.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
                                const outTime = s.check_out ? new Date(s.check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
                                return `#${i + 1}: ${inTime} to ${outTime}`;
                            }).join(" | ");
                        }
                        
                        const totalHours = ((record.total_minutes || 0) / 60).toFixed(2) + " hrs";
                        const status = sessions.length && sessions[sessions.length - 1].check_out === null ? "Working" : "Completed";
                        const summary = record.work_summary ? record.work_summary.replace(/(\r\n|\n|\r)/gm, " | ") : "No description provided";

                        rows.push([ p.pr_id, p.full_name, date, sessionText, totalHours, status, summary ]);
                    }
                });

                const csvContent = "\uFEFF" + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
                const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = `Daily_Attendance_${date}.csv`;
                
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                if (btn) {
                    btn.innerHTML = origHtml;
                    btn.disabled = false;
                }
                UI.showToast("Attendance Data Exported Successfully!", "success");
            },

            generate: async () => {
                if (!window.jspdf) return UI.showToast("PDF Library loading...", "warning");
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                const type = document.getElementById("reportType").value;
                const date = document.getElementById("reportDate").value || todayStr();

                doc.setFontSize(20);
                doc.text(`Attendance Report (${type.toUpperCase()})`, 14, 22);
                doc.setFontSize(11);
                doc.text(`Date Filter: ${date}`, 14, 30);

                const attendance = await DB.get("attendance") || [];
                const users = await DB.get("users") || [];
                const leaves = await DB.get("pr_leave_requests") || [];
                const atts = attendance.filter(a => a && a.date === date);
                let body = [];

                users.filter(u => u && u.role === "PR").forEach(user => {
                    const record = atts.find(a => a.pr_id === user.pr_id);
                    const onLeave = leaves.find(l => l && l.pr_id === user.pr_id && l.status === "Approved" && date >= l.leave_from && date <= l.leave_to) || user.status === 'Disabled';

                    if (!record) {
                        body.push([user.pr_id, user.full_name, onLeave ? "On Leave" : "Absent", "", ""]);
                        return;
                    }

                    const sessions = record.sessions || [];
                    const sessionText = sessions.map((s, index) => {
                        const inTime = s.check_in ? new Date(s.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
                        const outTime = s.check_out ? new Date(s.check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
                        return `#${index + 1}: ${inTime}-${outTime}`;
                    }).join("\n");

                    const hours = ((record.total_minutes || 0) / 60).toFixed(2) + " hrs";
                    body.push([user.pr_id, user.full_name, sessionText, hours, record.work_summary || ""]);
                });

                doc.autoTable({
                    startY: 40,
                    head: [["PR ID", "Name", "Sessions", "Hours", "Summary"]],
                    body: body,
                    styles: { fontSize: 9, cellPadding: 3, overflow: "linebreak" },
                    headStyles: { fontStyle: "bold" },
                    columnStyles: { 2: { cellWidth: 60 }, 4: { cellWidth: 60 } }
                });

                doc.save(`Attendance_${type}_${date}.pdf`);
                UI.showToast("PDF generated successfully!");
            },

            generateCSV: async () => {
                const type = document.getElementById("reportType").value;
                const date = document.getElementById("reportDate").value || todayStr();
                const attendance = await DB.get("attendance") || [];
                const users = await DB.get("users") || [];
                const leaves = await DB.get("pr_leave_requests") || [];
                const todayAttendance = attendance.filter(a => a && a.date === date);
                const rows = [["PR ID", "Name", "Sessions", "Hours", "Summary"]];

                users.filter(u => u && u.role === "PR").forEach(user => {
                    const record = todayAttendance.find(a => a.pr_id === user.pr_id);
                    const onLeave = leaves.find(l => l && l.pr_id === user.pr_id && l.status === "Approved" && date >= l.leave_from && date <= l.leave_to) || user.status === 'Disabled';

                    if (record) {
                        const sessions = record.sessions || [];
                        const sessionText = sessions.map((s, index) => {
                            const inTime = s.check_in ? new Date(s.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
                            const outTime = s.check_out ? new Date(s.check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
                            return `#${index + 1}: ${inTime}-${outTime}`;
                        }).join(" | ");
                        rows.push([user.pr_id, user.full_name, sessionText, ((record.total_minutes || 0) / 60).toFixed(2) + " hrs", record.work_summary || ""]);
                    } else {
                        rows.push([user.pr_id, user.full_name, onLeave ? "On Leave" : "Absent", "", ""]);
                    }
                });

                const csvContent = "\uFEFF" + rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
                const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = `Attendance_${type}_${date}.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
                UI.showToast("CSV downloaded successfully!", "success");
            },

            // --- OTHER ADMIN VIEWS (PRs, Attendance, etc.) ---
            renderPRs: async () => {
                const searchEl = document.getElementById('searchPR');
                const term = (searchEl ? searchEl.value : '').toLowerCase();
                const users = await DB.get('users') || [];
                let prs = users.filter(u => u && u.role === 'PR');
                if (term) prs = prs.filter(p => (p.full_name || '').toLowerCase().includes(term) || (p.pr_id && p.pr_id.toLowerCase().includes(term)));

                let html = '';
                prs.forEach(p => {
                    const statusClass = p.status === 'Active' ? 'badge-completed' : 'badge-absent';
                    html += `<tr><td><strong>${p.pr_id}</strong></td><td>${p.full_name}<br><small>${p.mobile}</small></td><td>${p.username}</td><td><span class="badge ${statusClass}">${p.status}</span></td><td>
                                <button class="btn btn-outline" style="padding: 6px 12px;" onclick="AdminApp.editPR('${p.id}')"><i class="ph ph-pencil"></i></button>
                                <button class="btn btn-danger" style="padding: 6px 12px;" onclick="AdminApp.deletePR('${p.id}')"><i class="ph ph-trash"></i></button>
                            </td></tr>`;
                });
                const tbody = document.getElementById('tablePRs');
                if (tbody) tbody.innerHTML = html || '<tr><td colspan="5" class="text-center text-muted">No PR found</td></tr>';
            },
            openAddPRModal: async () => {
                const users = await DB.get('users') || [];
                const nextIdNum = 1000 + users.filter(u=> u && u.role==='PR').length + 1;
                const genId = `PR-${nextIdNum}`;
                const genPass = Math.random().toString(36).slice(-8);

                UI.showModal('Create PR Account', `
                    <form onsubmit="AdminApp.savePR(event, null)">
                        <div class="form-group"><label class="form-label">Full Name</label><input type="text" id="prName" class="form-control" required></div>
                        <div class="form-group"><label class="form-label">Mobile</label><input type="text" id="prMobile" class="form-control" required></div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                            <div class="form-group"><label class="form-label">Generated PR ID</label><input type="text" id="prId" class="form-control" value="${genId}" readonly></div>
                            <div class="form-group"><label class="form-label">Generated Password</label><input type="text" id="prPass" class="form-control" value="${genPass}" readonly></div>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width:100%; margin-top: 16px;">Save PR Profile</button>
                    </form>
                `);
            },
            editPR: async (id) => {
                const users = await DB.get('users') || [];
                const p = users.find(u => u && u.id === id);
                if (!p) return;
                UI.showModal('Edit PR Account', `
                    <form onsubmit="AdminApp.savePR(event, '${id}')">
                        <div class="form-group"><label class="form-label">Full Name</label><input type="text" id="prName" class="form-control" value="${p.full_name}" required></div>
                        <div class="form-group"><label class="form-label">Mobile</label><input type="text" id="prMobile" class="form-control" value="${p.mobile}" required></div>
                        <div class="form-group"><label class="form-label">Status</label>
                            <select id="prStatus" class="form-control">
                                <option value="Active" ${p.status==='Active'?'selected':''}>Active</option>
                                <option value="Disabled" ${p.status==='Disabled'?'selected':''}>Disabled</option>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width:100%; margin-top: 16px;">Update PR</button>
                    </form>
                `);
            },
            savePR: async (e, id) => {
                e.preventDefault();
                const name = document.getElementById('prName').value;
                const mobile = document.getElementById('prMobile').value;
                if(id) { 
                    await DB.update('users', id, { full_name: name, mobile, status: document.getElementById('prStatus').value });
                    UI.showToast('PR updated successfully.');
                } else { 
                    const pr_id = document.getElementById('prId').value;
                    const pass = document.getElementById('prPass').value;
                    const username = `pr.${name.split(' ')[0].toLowerCase()}${Math.floor(Math.random()*100)}`;
                    await DB.insert('users', { role: 'PR', pr_id, username, password: pass, full_name: name, mobile, status: 'Active' });
                    UI.showToast('PR created successfully.');
                }
                UI.closeModal(); AdminApp.renderPRs();
            },
            deletePR: (id) => { UI.confirm('Delete PR', 'Permanently delete this PR account?', async () => { await DB.remove('users', id); UI.showToast('PR deleted.', 'success'); AdminApp.renderPRs(); }); },

            renderAttendance: async () => {
                try {
                    const filterEl = document.getElementById("filterAttDate");
                    let date = filterEl ? filterEl.value : "";
                    if (!date) { 
                        date = todayStr(); 
                        if (filterEl) filterEl.value = date; 
                    }

                    const attendance = await DB.get("attendance") || [];
                    const users = await DB.get("users") || [];
                    const leaves = await DB.get("pr_leave_requests") || [];
                    
                    const atts = attendance.filter(a => a && a.date === date);
                    const prs = users.filter(u => u && u.role === "PR");

                    let html = "";
                    prs.forEach(p => {
                        const record = atts.find(a => a.pr_id === p.pr_id);
                        const onLeave = leaves.find(l => l && l.pr_id === p.pr_id && l.status === "Approved" && date >= l.leave_from && date <= l.leave_to) || p.status === 'Disabled';

                        if (!record) {
                            if (onLeave) {
                                html += `<tr><td><strong>${p.full_name}</strong><br><small>${p.pr_id}</small></td><td>${date}</td><td>-</td><td>-</td><td><span class="badge badge-pending">On Leave</span></td><td><button class="btn btn-outline btn-sm" style="padding: 4px 10px;" onclick="AdminApp.openEditAttendanceModal('${p.pr_id}', '${date}')"><i class="ph-bold ph-pencil"></i> Edit</button></td></tr>`;
                            } else {
                                html += `<tr><td><strong>${p.full_name}</strong><br><small>${p.pr_id}</small></td><td>${date}</td><td>-</td><td>-</td><td><span class="badge badge-absent">Absent</span></td><td><div style="display:flex;gap:8px;"><button class="btn btn-warning btn-sm" onclick="AdminApp.sendReminder('${p.pr_id}')"><i class="ph ph-whatsapp-logo"></i></button> <button class="btn btn-outline btn-sm" style="padding: 4px 10px;" onclick="AdminApp.openEditAttendanceModal('${p.pr_id}', '${date}')"><i class="ph-bold ph-plus"></i> Add</button></div></td></tr>`;
                            }
                            return;
                        }

                        const sessions = record.sessions || [];
                        let sessionText = "-";
                        if (sessions.length) {
                            sessionText = sessions.map((s, i) => {
                                const inTime = s.check_in ? new Date(s.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
                                const outTime = s.check_out ? new Date(s.check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
                                return `#${i + 1}: ${inTime} → ${outTime}`;
                            }).join("<br>");
                        }
                        const totalHours = ((record.total_minutes || 0) / 60).toFixed(2);
                        const status = sessions.length && sessions[sessions.length - 1].check_out === null ? "Working" : "Completed";

                        html += `<tr><td><strong>${p.full_name}</strong><br><small>${p.pr_id}</small></td><td>${date}</td><td>${sessionText}</td><td><strong>${totalHours} hrs</strong></td><td><span class="badge ${status === "Working" ? "badge-working" : "badge-completed"}">${status}</span></td><td><button class="btn btn-outline btn-sm" style="padding: 4px 10px;" onclick="AdminApp.openEditAttendanceModal('${p.pr_id}', '${date}')"><i class="ph-bold ph-pencil"></i> Edit</button></td></tr>`;
                    });
                    const tbody = document.getElementById("tableAdminAttendance");
                    if (tbody) tbody.innerHTML = html || '<tr><td colspan="6" class="text-center text-muted">No attendance data found</td></tr>';
                } catch (err) {
                    console.error("Error in renderAttendance:", err);
                    UI.showToast("Failed to load attendance data.", "error");
                }
            },

            sendReminder: async (prId) => {
                const users = await DB.get("users") || [];
                const user = users.find(u => u && u.pr_id === prId);
                if (!user || !user.mobile) return UI.showToast("Mobile number not found", "error");
                const message = `🌿 নমস্কার, ${user.full_name},\n\n📌 আমাদের রেকর্ড অনুযায়ী আজকের আপনার উপস্থিতি (Attendance) এখনও নথিভুক্ত হয়নি।\n✅ অনুগ্রহ করে যত দ্রুত সম্ভব আপনার Check-In সম্পন্ন করুন।`;
                window.open(`https://wa.me/91${user.mobile.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank");
            },
            sendReminderAll: async () => {
                const date = todayStr();
                const attendance = await DB.get("attendance") || [];
                const users = await DB.get("users") || [];
                const leaves = await DB.get("pr_leave_requests") || [];
                const todayAttendance = attendance.filter(a => a && a.date === date);

                const absents = users.filter(user => {
                    if (!user || user.role !== "PR") return false;
                    if (user.status === 'Disabled') return false; 
                    if (todayAttendance.find(a => a.pr_id === user.pr_id)) return false;
                    if (leaves.find(l => l && l.pr_id === user.pr_id && l.status === "Approved" && date >= l.leave_from && date <= l.leave_to)) return false;
                    if (!user.mobile || user.mobile.trim() === "") return false;
                    return true;
                });

                if (absents.length === 0) return UI.showToast("No absent employees found.", "success");
                absents.forEach((user, index) => {
                    setTimeout(() => {
                        const msg = `Hello ${user.full_name},\nThis is a friendly reminder to mark your attendance for today.\nPlease check in as soon as possible.`;
                        window.open(`https://wa.me/91${user.mobile.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
                    }, index * 1500);
                });
                UI.showToast(`${absents.length} reminder(s) opening in WhatsApp.`, "success");
            },

            renderHolidays: async () => {
                const holidays = await DB.get('holidays') || [];
                let html = '';
                holidays.forEach(h => {
                    if (!h) return;
                    html += `<tr><td><strong>${h.holiday_date}</strong></td><td>${h.holiday_name}</td><td>${h.description}</td><td><button class="btn btn-danger" style="padding: 4px 8px;" onclick="AdminApp.deleteHoliday('${h.id}')"><i class="ph ph-trash"></i></button></td></tr>`;
                });
                const tbody = document.getElementById('tableHolidays');
                if (tbody) tbody.innerHTML = html || '<tr><td colspan="4" class="text-center text-muted">No holidays defined.</td></tr>';
            },
            openAddHolidayModal: () => {
                UI.showModal('Add Holiday', `
                    <form onsubmit="AdminApp.saveHoliday(event)">
                        <div class="form-group"><label class="form-label">Date</label><input type="date" id="holDate" class="form-control" required></div>
                        <div class="form-group"><label class="form-label">Holiday Name</label><input type="text" id="holName" class="form-control" required></div>
                        <div class="form-group"><label class="form-label">Description</label><input type="text" id="holDesc" class="form-control"></div>
                        <button type="submit" class="btn btn-primary" style="width:100%; margin-top: 16px;">Save Holiday</button>
                    </form>
                `);
            },
            saveHoliday: async (e) => {
                e.preventDefault();
                await DB.insert('holidays', { holiday_date: document.getElementById('holDate').value, holiday_name: document.getElementById('holName').value, description: document.getElementById('holDesc').value });
                UI.closeModal(); UI.showToast('Holiday added.', 'success'); AdminApp.renderHolidays();
            },
            deleteHoliday: async (id) => { await DB.remove('holidays', id); UI.showToast('Holiday removed.'); AdminApp.renderHolidays(); },

            // --- PR LEAVES ---
            renderPRLeaves: async () => {
                const leaves = await DB.get('pr_leave_requests') || [];
                const prs = await DB.get('users') || [];
                let html = '';
                leaves.forEach(l => {
                    if (!l) return;
                    const pr = prs.find(p => p && p.pr_id === l.pr_id) || {full_name: 'Unknown'};
                    const bc = l.status === 'Approved' ? 'badge-completed' : (l.status === 'Rejected' ? 'badge-absent' : 'badge-pending');
                    
                    // Added Delete Button to Actions
                    let actions = l.status === 'Pending' ? `<button class="btn btn-success" style="padding: 4px 8px; margin-right: 4px;" onclick="AdminApp.updatePRLeave('${l.id}', 'Approved')" title="Approve"><i class="ph ph-check"></i></button> <button class="btn btn-warning" style="padding: 4px 8px; margin-right: 4px;" onclick="AdminApp.updatePRLeave('${l.id}', 'Rejected')" title="Reject"><i class="ph ph-x"></i></button>` : '';
                    actions += `<button class="btn btn-danger" style="padding: 4px 8px;" onclick="AdminApp.deletePRLeave('${l.id}')" title="Delete Request"><i class="ph ph-trash"></i></button>`;
                    
                    html += `<tr><td><strong>${pr.full_name}</strong><br><small>${l.pr_id}</small></td><td>${l.leave_from} to ${l.leave_to}</td><td>${l.total_days}</td><td>${l.reason}</td><td><span class="badge ${bc}">${l.status}</span></td><td><div style="display:flex; align-items:center;">${actions}</div></td></tr>`;
                });
                const tbody = document.getElementById('tablePRLeaves');
                if (tbody) tbody.innerHTML = html || '<tr><td colspan="6" class="text-center">No requests found.</td></tr>';
            },
            updatePRLeave: async (id, status) => {
                UI.confirm(`${status} Request`, `Are you sure you want to ${status.toLowerCase()} this leave request?`, async () => {
                    await DB.update('pr_leave_requests', id, { status, approved_by: App.currentUser ? App.currentUser.full_name : 'Admin' });
                    UI.showToast(`Request ${status}`, 'success'); AdminApp.renderPRLeaves();
                });
            },
            // NEW FUNCTION: Delete PR Leave
            deletePRLeave: async (id) => {
                UI.confirm('Delete Leave Request', 'Are you sure you want to permanently delete this PR leave request?', async () => {
                    await DB.remove('pr_leave_requests', id);
                    UI.showToast('Leave request deleted successfully.', 'success');
                    AdminApp.renderPRLeaves();
                });
            },

            // --- MEMBER LEAVES ---
            renderMemberLeaves: async () => {
                const leaves = await DB.get('member_leave_requests') || [];
                let html = '';
                leaves.forEach(l => {
                    if (!l) return;
                    const bc = l.status === 'Approved' ? 'badge-completed' : (l.status === 'Rejected' ? 'badge-absent' : 'badge-pending');
                    
                    // Added Delete Button to Actions
                    let actions = l.status === 'Pending' ? `<button class="btn btn-success" style="padding: 4px 8px; margin-right: 4px;" onclick="AdminApp.updateMemberLeave('${l.id}', 'Approved')" title="Approve"><i class="ph ph-check"></i></button> <button class="btn btn-warning" style="padding: 4px 8px; margin-right: 4px;" onclick="AdminApp.updateMemberLeave('${l.id}', 'Rejected')" title="Reject"><i class="ph ph-x"></i></button>` : '';
                    actions += `<button class="btn btn-danger" style="padding: 4px 8px;" onclick="AdminApp.deleteMemberLeave('${l.id}')" title="Delete Request"><i class="ph ph-trash"></i></button>`;
                    
                    html += `<tr><td><strong>${l.member_name}</strong><br><small>${l.mobile}</small></td><td>${l.leave_from} to ${l.leave_to}</td><td>${l.total_days}</td><td>${l.reason}</td><td><span class="badge ${bc}">${l.status}</span></td><td><div style="display:flex; align-items:center;">${actions}</div></td></tr>`;
                });
                const tbody = document.getElementById('tableMemberLeaves');
                if (tbody) tbody.innerHTML = html || '<tr><td colspan="6" class="text-center">No requests found.</td></tr>';
            },
            updateMemberLeave: async (id, status) => {
                UI.confirm(`${status} Request`, `Are you sure you want to ${status.toLowerCase()} this member leave request?`, async () => {
                    await DB.update('member_leave_requests', id, { status, approved_by: App.currentUser ? App.currentUser.full_name : 'Admin' });
                    UI.showToast(`Request ${status}`, 'success'); AdminApp.renderMemberLeaves();
                });
            },
            renderApprovedMemberLeaves: async () => {
                const leaves = (await DB.get('member_leave_requests') || []).filter(l => l && l.status === 'Approved');
                let html = '';
                leaves.forEach(l => {
                    // Added Delete Button next to the Approved Status
                    html += `<tr>
                        <td><strong>${l.member_name}</strong><br><small>${l.mobile}</small></td>
                        <td>${l.leave_from} to ${l.leave_to}</td>
                        <td>${l.total_days}</td>
                        <td>${l.reason}</td>
                        <td style="display:flex; gap:8px; align-items:center;">
                            <span class="badge badge-completed">Approved by ${l.approved_by || 'Admin'}</span>
                            <button class="btn btn-danger" style="padding: 4px 8px;" onclick="AdminApp.deleteMemberLeave('${l.id}')" title="Delete Request"><i class="ph ph-trash"></i></button>
                        </td>
                    </tr>`;
                });
                const tbody = document.getElementById('tableApprovedMemberLeaves');
                if (tbody) tbody.innerHTML = html || '<tr><td colspan="5" class="text-center">No approved member leaves.</td></tr>';
            },
            // NEW FUNCTION: Delete Member Leave
            deleteMemberLeave: async (id) => {
                UI.confirm('Delete Leave Request', 'Are you sure you want to permanently delete this Member leave request?', async () => {
                    await DB.remove('member_leave_requests', id);
                    UI.showToast('Leave request deleted successfully.', 'success');
                    AdminApp.renderMemberLeaves();
                    AdminApp.renderApprovedMemberLeaves(); 
                });
            },

            renderNotifications: async () => {
                const { data: notifs, error } = await supabaseClient.from('pr_notifications').select('*, pr_notification_targets(pr_id)').order('created_at', { ascending: false });
                if (error) return console.error("Error fetching notifications:", error);

                let html = '';
                (notifs || []).forEach(n => {
                    if (!n) return;
                    let uClass = n.urgency === 'urgent' ? 'badge-absent' : (n.urgency === 'important' ? 'badge-pending' : 'badge-working');
                    let attachHtml = n.attachment ? `<a href="${n.attachment}" target="_blank" style="color:var(--primary); font-weight:600;"><i class="ph-bold ph-paperclip"></i> View File</a>` : '-';
                    let targetsCount = n.pr_notification_targets ? n.pr_notification_targets.length : 0;
                    let targetsHtml = targetsCount > 3 ? `${targetsCount} PRs Selected` : (n.pr_notification_targets || []).map(t => t.pr_id).join(', ');

                    html += `<tr>
                        <td>${new Date(n.created_at + 'Z').toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td><strong>${n.title}</strong><br><span class="badge ${uClass}" style="margin-top:6px; display:inline-block; font-size:11px;">${n.urgency.toUpperCase()}</span></td>
                        <td style="white-space: pre-wrap; max-width: 300px;">${n.message}</td>
                        <td><small>${targetsHtml}</small></td>
                        <td>${attachHtml}</td>
                        <td><button class="btn btn-danger" style="padding: 6px 12px;" onclick="AdminApp.deleteNotification('${n.id}')" title="Delete"><i class="ph ph-trash"></i></button></td>
                    </tr>`;
                });
                const tbody = document.getElementById('tableNotifications');
                if (tbody) tbody.innerHTML = html || '<tr><td colspan="6" class="text-center">No notifications found.</td></tr>';
            },
            openNotificationModal: async () => {
                const users = await DB.get('users') || [];
                const prs = users.filter(u => u && u.role === 'PR');
                let prOptions = `<div style="max-height: 160px; overflow-y: auto; border: 1.5px solid rgba(10, 25, 49, 0.1); border-radius: var(--radius-md); padding: 12px; margin-top: 8px; background: #fff;">
                    <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
                        <input type="checkbox" id="notifSelectAll" onchange="AdminApp.toggleAllPRs(this)" style="width: 16px; height: 16px;"> <strong style="color: var(--primary);">Select All PRs</strong>
                    </label><hr style="margin: 8px 0; border-color: rgba(10, 25, 49, 0.05);">`;
                prs.forEach(pr => {
                    prOptions += `<label style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; cursor: pointer;">
                        <input type="checkbox" class="pr-target-cb" value="${pr.pr_id}" style="width: 16px; height: 16px;"> <span style="font-size: 14px;">${pr.full_name} <small style="color: var(--text-muted);">(${pr.pr_id})</small></span>
                    </label>`;
                });
                prOptions += `</div>`;

                UI.showModal('Broadcast Notification', `
                    <form onsubmit="AdminApp.sendNotification(event)">
                        <div class="form-group"><label class="form-label">Title</label><input type="text" id="notifTitle" class="form-control" required placeholder="Main subject"></div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                            <div class="form-group"><label class="form-label">Urgency Level</label><select id="notifUrgency" class="form-control"><option value="normal">🔵 Normal</option><option value="important">🟠 Important</option><option value="urgent">🔴 Urgent</option></select></div>
                            <div class="form-group"><label class="form-label">Attachment (.jpg, .pdf)</label><input type="file" id="notifFile" class="form-control" accept=".jpg,.jpeg,.png,.pdf"></div>
                        </div>
                        <div class="form-group"><label class="form-label">Detailed Message</label><textarea id="notifMessage" class="form-control" required placeholder="Explain the details..."></textarea></div>
                        <div class="form-group"><label class="form-label">Select Target Audience</label>${prOptions}</div>
                        <button type="submit" id="btnSendNotif" class="btn btn-primary" style="width:100%; margin-top: 16px;">Send Notification <i class="ph-bold ph-paper-plane-right"></i></button>
                    </form>
                `);
            },
            toggleAllPRs: (cb) => { document.querySelectorAll('.pr-target-cb').forEach(c => c.checked = cb.checked); },
            sendNotification: async (e) => {
                e.preventDefault();
                const btn = document.getElementById('btnSendNotif');
                const origText = btn ? btn.innerHTML : '';
                const selectedPRs = Array.from(document.querySelectorAll('.pr-target-cb:checked')).map(cb => cb.value);
                if(selectedPRs.length === 0) return UI.showToast('Please select at least one PR.', 'error');

                if (btn) {
                    btn.disabled = true; 
                    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Processing...';
                }
                const title = document.getElementById('notifTitle').value;
                const message = document.getElementById('notifMessage').value;
                const urgency = document.getElementById('notifUrgency').value;
                const fileInput = document.getElementById('notifFile');
                let attachmentUrl = null;

                try {
                    if (fileInput && fileInput.files.length > 0) {
                        const file = fileInput.files[0];
                        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${file.name.split('.').pop()}`;
                        const { data, error } = await supabaseClient.storage.from('notifications').upload(fileName, file);
                        if (error) throw new Error("File upload failed: " + error.message);
                        attachmentUrl = supabaseClient.storage.from('notifications').getPublicUrl(fileName).data.publicUrl;
                    }
                    const loggedInName = App.currentUser ? App.currentUser.full_name : 'Admin';
                    const { data: notifData, error: notifError } = await supabaseClient.from('pr_notifications').insert([{ title, message, urgency, attachment: attachmentUrl, created_by: loggedInName }]).select();
                    if (notifError) throw notifError;
                    
                    const targets = selectedPRs.map(pr_id => ({ notification_id: notifData[0].id, pr_id: pr_id, is_read: false }));
                    const { error: targetsError } = await supabaseClient.from('pr_notification_targets').insert(targets);
                    if (targetsError) throw targetsError;

                    UI.showToast(`Notification sent to ${selectedPRs.length} PR(s)!`, 'success');
                    UI.closeModal(); AdminApp.renderNotifications();
                } catch (err) {
                    UI.showToast(`Error: ${err.message}`, 'error');
                    if (btn) {
                        btn.disabled = false; 
                        btn.innerHTML = origText;
                    }
                }
            },
            deleteNotification: async (id) => {
                UI.confirm('Delete Notification', 'Are you sure?', async () => {
                    const { error } = await supabaseClient.from('pr_notifications').delete().eq('id', id);
                    if (error) UI.showToast(`Error: ${error.message}`, 'error');
                    else { UI.showToast('Notification safely removed.', 'success'); AdminApp.renderNotifications(); }
                });
            },
                // --- NEW: ARTIST NOTIFICATION SYSTEM ---
            openArtistNotificationModal: async () => {
                const html = `
                    <form onsubmit="AdminApp.sendArtistNotification(event)">
                        <div class="form-group">
                            <label class="form-label" style="color: var(--gold);">Target Artist Audience</label>
                            <div style="display:flex; gap:16px; margin-bottom:12px;">
                                <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
                                    <input type="radio" name="artTargetType" value="ALL_ARTISTS" checked onchange="document.getElementById('specificArtistBox').style.display='none'"> 
                                    All Artists
                                </label>
                                <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
                                    <input type="radio" name="artTargetType" value="SPECIFIC" onchange="document.getElementById('specificArtistBox').style.display='block'"> 
                                    Specific Artist
                                </label>
                            </div>
                        </div>
                        
                        <div class="form-group" id="specificArtistBox" style="display:none;">
                            <label class="form-label">Select Artist</label>
                            <select id="notifArtistId" class="form-control">
                                <option value="">Loading artists...</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Notification Title</label>
                            <input type="text" id="artNotifTitle" class="form-control" required placeholder="e.g. New Art Assignment / System Update">
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Message Content</label>
                            <textarea id="artNotifMessage" class="form-control" required placeholder="Write your message for the artist(s)..."></textarea>
                        </div>
                        
                        <button type="submit" class="btn btn-primary" style="width:100%">
                            <i class="ph-bold ph-paper-plane-right"></i> Broadcast to Artist(s)
                        </button>
                    </form>
                `;
                
                UI.showModal('Send Artist Notification', html);

                // Fetch Artists for the dropdown
                const { data, error } = await supabaseClient.from('artists').select('id, name');
                if (data) {
                    document.getElementById('notifArtistId').innerHTML = data.map(art => 
                        `<option value="${art.id}">${art.name} (${art.id.substring(0, 6).toUpperCase()})</option>`
                    ).join('');
                }
            },

            sendArtistNotification: async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button');
                const origText = btn.innerHTML;
                btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Sending...';
                btn.disabled = true;

                const type = document.querySelector('input[name="artTargetType"]:checked').value;
                const target = type === 'ALL_ARTISTS' ? 'ALL_ARTISTS' : document.getElementById('notifArtistId').value;
                
                const payload = {
                    title: document.getElementById('artNotifTitle').value,
                    message: document.getElementById('artNotifMessage').value,
                    target_member_id: target,
                    created_at: new Date().toISOString() // Using standard ISO string
                };

                const { error } = await supabaseClient.from('admin_messages').insert([payload]);
                
                if (error) {
                    UI.showToast('Error sending message: ' + error.message, 'error'); 
                } else {
                    UI.showToast('Artist Notification broadcasted successfully!', 'success');
                    UI.closeModal();
                }
                
                btn.innerHTML = origText;
                btn.disabled = false;
            },
            // ----------------------------------------
            saveSettings: async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button');
                const origText = btn ? btn.innerHTML : '';
                if (btn) {
                    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Saving...';
                    btn.disabled = true;
                }

                const officeName = document.getElementById('settingOfficeName').value;
                const logoUrl = document.getElementById('settingLogo').value;
                
                localStorage.setItem('app_settings', JSON.stringify({ officeName, logoUrl }));
                App.applySettings();

                setTimeout(() => {
                    if (btn) {
                        btn.innerHTML = origText;
                        btn.disabled = false;
                    }
                    UI.showToast('Settings saved and applied successfully!', 'success');
                }, 500);
            }
        };

        // --- PR APP ---
        const PRApp = {
            init: () => {
                const u = App.currentUser;
                if (!u) return;
                document.getElementById('prTopName').innerText = u.full_name;
                document.getElementById('prTopId').innerText = u.pr_id;
                document.getElementById('prTopAvatar').innerText = u.full_name.charAt(0);
                
                const hour = new Date().getHours();
                let greeting = hour < 12 ? "Good Morning" : (hour < 15 ? "Good Noon" : (hour < 18 ? "Good Afternoon" : "Good Evening"));
                document.getElementById("prGreeting").innerText = `${greeting}, ${u.full_name.split(" ")[0]}! `;
                document.getElementById("prCurrentDate").innerText = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
                
                document.getElementById('prProfileDetails').innerHTML = `
                    <div style="background: rgba(10, 25, 49, 0.02); border: 1px solid rgba(10, 25, 49, 0.05); border-radius: var(--radius-md); padding: 20px; margin-bottom: 24px;">
                        <div style="display: flex; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px dashed rgba(0,0,0,0.1); margin-bottom: 12px;">
                            <span style="color: var(--text-muted); font-size: 13px;"><i class="ph-fill ph-user"></i> Full Name</span>
                            <strong style="color: var(--primary);">${u.full_name}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px dashed rgba(0,0,0,0.1); margin-bottom: 12px;">
                            <span style="color: var(--text-muted); font-size: 13px;"><i class="ph-fill ph-identification-badge"></i> PR ID</span>
                            <strong style="color: var(--gold);">${u.pr_id}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px dashed rgba(0,0,0,0.1); margin-bottom: 12px;">
                            <span style="color: var(--text-muted); font-size: 13px;"><i class="ph-fill ph-at"></i> Username</span>
                            <strong style="color: var(--primary);">${u.username}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px dashed rgba(0,0,0,0.1); margin-bottom: 12px;">
                            <span style="color: var(--text-muted); font-size: 13px;"><i class="ph-fill ph-phone"></i> Mobile Number</span>
                            <strong style="color: var(--primary);">${u.mobile}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--text-muted); font-size: 13px;"><i class="ph-fill ph-shield-check"></i> Account Status</span>
                            <span class="badge ${u.status === 'Active' ? 'badge-completed' : 'badge-absent'}">${u.status}</span>
                        </div>
                    </div>

                    <h4 style="font-size: 14px; margin-bottom: 12px; color: var(--text-muted);">DIGITAL IDENTITY CARD</h4>
                    
                    <!-- NAVY BLUE & GOLDEN ID CARD -->
                    <div id="prIdCard" style="background: var(--primary); border: 2px solid var(--gold); border-radius: 16px; padding: 24px; color: white; position: relative; overflow: hidden; box-shadow: var(--shadow-gold); margin-bottom: 16px;">
                        
                        <!-- Gold Top Accent -->
                        <div style="position: absolute; top: 0; left: 0; right: 0; height: 6px; background: var(--gold);"></div>
                        
                        <!-- Chinnapatra Official Stamp -->
                        <div style="position: absolute; bottom: 20px; right: 16px; border: 2px solid rgba(212, 175, 55, 0.4); color: rgba(212, 175, 55, 0.4); font-weight: bold; font-size: 11px; text-transform: uppercase; padding: 6px 10px; transform: rotate(-12deg); border-radius: 6px; letter-spacing: 1px; text-align: center; pointer-events: none;">
                            CHINNAPATRA<br>OFFICIAL
                        </div>
                        
                        <!-- Header -->
                        <div style="border-bottom: 1px solid rgba(212, 175, 55, 0.3); padding-bottom: 16px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h3 style="color: var(--gold); margin: 0; font-family: var(--font-heading); font-size: 18px; letter-spacing: 1px; text-transform: uppercase;">CHINNAPATRA</h3>
                                <div style="font-size: 9px; letter-spacing: 2px; color: rgba(255,255,255,0.7);">OFFICIAL PR DESK</div>
                            </div>
                        </div>
                        
                        <!-- Info Section -->
                        <div style="display: flex; align-items: center; gap: 20px; text-align: left; position: relative; z-index: 2;">
                            <div style="width: 70px; height: 70px; background: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold; color: var(--primary); box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 2px solid white;">
                                ${u.full_name.charAt(0)}
                            </div>
                            <div style="flex: 1;">
                                <div style="font-size: 18px; font-weight: bold; color: white; margin-bottom: 2px;">${u.full_name}</div>
                                <div style="color: var(--gold); font-size: 12px; margin-bottom: 12px; font-weight: 600; letter-spacing: 0.5px;">${u.role.toUpperCase()} EXECUTIVE</div>
                                
                                <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; font-size: 12px; color: rgba(255,255,255,0.85);">
                                    <strong style="color: var(--gold-light);">ID No:</strong> <span>${u.pr_id}</span>
                                    <strong style="color: var(--gold-light);">User:</strong> <span>${u.username}</span>
                                    <strong style="color: var(--gold-light);">Mob:</strong> <span>${u.mobile}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button class="btn btn-outline" style="width: 100%; border-color: var(--gold); color: var(--primary); font-weight: bold;" onclick="PRApp.downloadIDCard()">
                        <i class="ph-bold ph-download-simple"></i> Download PDF Card
                    </button>
                `;
                PRApp.switchTab('pr-dashboard');
                
                // Request Notification Permission
                if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
                    Notification.requestPermission();
                }

                // Subscribing to Supabase Realtime for Notifications
                if (App.currentUser && App.currentUser.role === 'PR') {
                    supabaseClient.channel('public:pr_notification_targets')
                        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pr_notification_targets', filter: `pr_id=eq.${u.pr_id}` }, async (payload) => {
                            
                            const { data: notif } = await supabaseClient
                                .from('pr_notifications')
                                .select('*')
                                .eq('id', payload.new.notification_id)
                                .single();

                            if (notif) {
                                PRApp.loadNotifications(); 
                                
                                // 1. PLAY YOUR CUSTOM TONE
                                try {
                                    // Make sure this mp3 file is in the same folder as your index.html!
                                    const audio = new Audio('universfield-new-notification-054-494259.mp3');
                                    audio.volume = 1.0;
                                    audio.play().catch(e => console.warn("Audio auto-play blocked by browser", e));
                                } catch(e) {}
                                
                                // 2. IN-APP WHATSAPP STYLE POPUP
                                if(UI.showWhatsAppNotification) {
                                    UI.showWhatsAppNotification(notif.title || 'New Admin Message', notif.message);
                                }
                                
                                // 3. OUTER OS NOTIFICATION (Lock Screen / Background)
                                if ('Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
                                    navigator.serviceWorker.ready.then(function(registration) {
                                        registration.showNotification(notif.title, {
                                            body: notif.message,
                                            icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
                                            badge: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
                                            vibrate: [200, 100, 200, 100, 200], 
                                            silent: false, // Ensures the phone plays a sound even if locked
                                            tag: 'pr-admin-msg',
                                            requireInteraction: true
                                        });
                                    });
                                }
                            }
                            
                        }).subscribe();
                }
            },
            // --- MY WORK LIST ---
            cachedMyWorkLists: [],
            
            loadWorkLists: async () => {
                const u = App.currentUser;
                if (!u) return;
                
                const container = document.getElementById('prWorkListCardsContainer');
                if (!container) return;
                container.innerHTML = `<div style="grid-column: 1/-1; text-align:center;"><i class="ph ph-spinner ph-spin"></i> Loading...</div>`;

                const workLists = await DB.get('pr_work_lists') || [];
                PRApp.cachedMyWorkLists = workLists.filter(w => w.pr_id === u.pr_id).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

                if (PRApp.cachedMyWorkLists.length === 0) {
                    container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; background: white; border-radius: 12px; color: var(--text-muted);">🎉 You have no pending work lists assigned!</div>`;
                    return;
                }

                let html = '';
                PRApp.cachedMyWorkLists.forEach(w => {
                    const dateObj = new Date(w.created_at + 'Z');
                    const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                    
                    // Convert line breaks into nice list items
                    const taskItems = w.tasks.split('\n').filter(t => t.trim() !== '').map(t => 
                        `<div style="display:flex; gap:8px; margin-bottom:8px; font-size:13px; color:var(--text-dark);">
                            <i class="ph-bold ph-check-square" style="color:var(--gold); margin-top:2px;"></i> <span>${t}</span>
                        </div>`
                    ).join('');

                    html += `
                        <div class="content-card" style="margin-bottom: 0; display: flex; flex-direction: column; border-top: 4px solid var(--primary); position: relative;">
                            <div style="position: absolute; top: -10px; right: 10px; font-size: 80px; color: rgba(10,25,49,0.03); z-index:0;"><i class="ph-fill ph-clipboard-text"></i></div>
                            <div style="position: relative; z-index: 1; flex: 1;">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                                    <div>
                                        <h3 style="color:var(--primary); font-size:16px; margin-bottom:4px; font-family:var(--font-heading);">${w.title}</h3>
                                        <div style="font-size:11px; color:var(--text-muted); font-weight:600;"><i class="ph-bold ph-calendar"></i> ISSUED: ${dateStr}</div>
                                    </div>
                                    <span class="badge badge-pending" style="font-size:10px;">Pending Tasks</span>
                                </div>
                                <div style="background: rgba(10,25,49,0.02); border-radius: 8px; padding: 12px; border: 1px dashed rgba(10,25,49,0.1); margin-bottom: 20px;">
                                    ${taskItems}
                                </div>
                            </div>
                            <button class="btn btn-outline" style="width: 100%; border-color: var(--primary); color: var(--primary); z-index:1;" onclick="PRApp.downloadWorkListPDF('${w.id}')">
                                <i class="ph-bold ph-download-simple"></i> Download PDF
                            </button>
                        </div>
                    `;
                });
                
                container.innerHTML = html;
            },

            downloadWorkListPDF: (id) => {
                const w = PRApp.cachedMyWorkLists.find(x => x.id === id);
                if (!w || !window.jspdf) return UI.showToast("Cannot generate PDF right now.", "error");
                
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                const u = App.currentUser;
                const dateStr = new Date(w.created_at + 'Z').toLocaleDateString();

                // Theme Header
                doc.setFillColor(10, 25, 49); // Navy Blue
                doc.rect(0, 0, 210, 35, 'F');
                doc.setFillColor(255, 153, 51); // Gold Line
                doc.rect(0, 35, 210, 2, 'F');

                doc.setTextColor(255, 153, 51);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(22);
                doc.text("CHINNAPATRA OFFICIAL", 105, 18, { align: "center" });
                
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(12);
                doc.setFont("helvetica", "normal");
                doc.text("OFFICIAL PR WORK ASSIGNMENT", 105, 26, { align: "center" });

                // Document Meta
                doc.setTextColor(10, 25, 49);
                doc.setFontSize(12);
                doc.setFont("helvetica", "bold");
                doc.text(`Subject: ${w.title}`, 14, 50);
                
                doc.setFont("helvetica", "normal");
                doc.setFontSize(10);
                doc.text(`Assigned To: ${u.full_name} (ID: ${u.pr_id})`, 14, 58);
                doc.text(`Date Issued: ${dateStr}`, 14, 64);
                
                doc.setDrawColor(200, 200, 200);
                doc.line(14, 68, 196, 68);

                // Tasks Parsing
                doc.setFont("helvetica", "bold");
                doc.setFontSize(14);
                doc.text("Assigned Tasks & Duties:", 14, 78);
                
                doc.setFont("helvetica", "normal");
                doc.setFontSize(11);
                
                const tasksArray = w.tasks.split('\n').filter(t => t.trim() !== '');
                let startY = 88;
                
                tasksArray.forEach((task, index) => {
                    // Draw a checkbox square
                    doc.setDrawColor(10, 25, 49);
                    doc.rect(14, startY - 4, 4, 4);
                    
                    // Break text to fit page width
                    const splitText = doc.splitTextToSize(task, 170);
                    doc.text(splitText, 22, startY);
                    
                    startY += (splitText.length * 6) + 4; // Adjust spacing based on text lines
                });

                // Footer Stamp
                const finalY = Math.max(startY + 20, 250);
                doc.setDrawColor(255, 153, 51);
                doc.setLineWidth(0.8);
                doc.roundedRect(135, finalY - 10, 60, 16, 2, 2, 'S');
                doc.setTextColor(255, 153, 51);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.text("AUTHORIZED BY", 165, finalY - 3, { align: "center" });
                doc.setFontSize(12);
                doc.text("CHINNAPATRA ADMIN", 165, finalY + 3, { align: "center" });

                doc.save(`WorkList_${u.pr_id}_${dateStr.replace(/\//g, '-')}.pdf`);
                UI.showToast("Work List PDF Downloaded!", "success");
            },
            switchTab: (tabId, evt) => {
                const view = document.getElementById('page-pr');
                if (!view) return;
                view.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
                if (evt && evt.currentTarget) {
                    evt.currentTarget.classList.add('active');
                } else {
                    const matchingNav = view.querySelector(`.nav-item[onclick*="${tabId}"]`);
                    if (matchingNav) matchingNav.classList.add('active');
                }
                view.querySelectorAll('.dashboard-view').forEach(el => el.classList.remove('active'));
                const targetView = document.getElementById(tabId);
                if (targetView) targetView.classList.add('active');
                if (window.innerWidth < 992) UI.toggleSidebar();

                if(tabId === 'pr-dashboard') PRApp.loadDashboard();
                if(tabId === 'pr-history') PRApp.loadHistory();
                if(tabId === 'pr-leave-history') PRApp.loadLeaves();
                if(tabId === 'pr-notifications') PRApp.loadNotifications();
                if(tabId === 'pr-chat') ChatApp.init('pr');
                if(tabId === 'pr-worklist') PRApp.loadWorkLists();
                if(tabId === 'pr-media-tasks') MediaPR.init();
            },
            loadDashboard: async () => {
                const u = App.currentUser;
                if (!u) return;
                const attendance = await DB.get("attendance") || [];
                const leaves = await DB.get("pr_leave_requests") || [];
                const atts = attendance.filter(a => a && a.pr_id === u.pr_id);

                const totalDaysEl = document.getElementById("prTotalDays");
                const totalLeavesEl = document.getElementById("prTotalLeaves");
                if (totalDaysEl) totalDaysEl.innerText = atts.length;
                if (totalLeavesEl) totalLeavesEl.innerText = leaves.filter(l => l && l.pr_id === u.pr_id && l.status === "Approved").length;

                const todayRecord = atts.find(a => a.date === todayStr());
                const actionArea = document.getElementById("prActionArea");

                if (actionArea) {
                    if (!todayRecord || (todayRecord.sessions || []).length === 0) {
                        actionArea.innerHTML = `<button class="btn btn-primary ripple-btn" style="padding:16px 48px;font-size:18px; width:100%; max-width: 300px;" onclick="PRApp.checkIn()"><i class="ph-bold ph-fingerprint" style="font-size:24px;"></i> Check In Now</button>`;
                    } else {
                        const sessions = todayRecord.sessions || [];
                        if (sessions[sessions.length - 1].check_out === null) {
                            actionArea.innerHTML = `<button class="btn btn-secondary" style="padding:16px 48px;font-size:18px; width:100%; max-width: 300px; background:var(--primary); color:white;" onclick="PRApp.openCheckOut()"><i class="ph-bold ph-sign-out" style="font-size:24px;"></i> Check Out</button>`;
                        } else {
                            actionArea.innerHTML = `<button class="btn btn-primary ripple-btn" style="padding:16px 48px;font-size:18px; width:100%; max-width: 300px;" onclick="PRApp.checkIn()"><i class="ph-bold ph-fingerprint" style="font-size:24px;"></i> Check In Again</button><div style="margin-top:10px;font-size:14px;color:var(--success); font-weight:600;">Today's Sessions Completed: ${sessions.length}</div>`;
                        }
                    }
                }

                // এই লাইনটিই বার্থডে উইজেটকে কল করবে
                App.renderBirthdayWidgets();
            },
            checkIn: async () => {
                const u = App.currentUser;
                if (!u) return;
                const now = new Date().toISOString();
                const attendance = await DB.get("attendance") || [];
                let record = attendance.find(a => a && a.pr_id === u.pr_id && a.date === todayStr());

                if (!record) {
                    await DB.insert("attendance", { pr_id: u.pr_id, date: todayStr(), sessions: [{ check_in: now, check_out: null }], total_minutes: 0, work_summary: "" });
                } else {
                    let sessions = record.sessions || [];
                    if (sessions.length && sessions[sessions.length - 1].check_out === null) return UI.showToast("Already Checked In", "warning");
                    sessions.push({ check_in: now, check_out: null });
                    await DB.update("attendance", record.id, { sessions: sessions });
                }
                UI.showToast("Checked in successfully", "success");
                PRApp.loadDashboard();
            },
            openCheckOut: () => {
                UI.showModal("Check Out", `
                    <form onsubmit="PRApp.submitCheckOut(event)">
                        <div class="form-group"><label class="form-label">Work Summary</label><textarea id="coSummary" class="form-control" placeholder="Describe today's work..."></textarea></div>
                        <button type="submit" class="btn btn-primary" style="width:100%;">Check Out</button>
                    </form>
                `);
            },
            submitCheckOut: async (e) => {
                e.preventDefault();
                const u = App.currentUser;
                if (!u) return;
                const attendance = await DB.get("attendance") || [];
                const record = attendance.find(a => a && a.pr_id === u.pr_id && a.date === todayStr());
                
                if (!record) return UI.showToast("Attendance not found", "error");
                let sessions = record.sessions || [];
                if (!sessions.length || sessions[sessions.length - 1].check_out !== null) return UI.showToast("No active check in", "warning");

                sessions[sessions.length - 1].check_out = new Date().toISOString();
                let totalMinutes = 0;
                sessions.forEach(s => { 
                    if (s.check_in && s.check_out) { 
                        totalMinutes += Math.floor((new Date(s.check_out) - new Date(s.check_in)) / 60000); 
                    } 
                });

                const summaryEl = document.getElementById("coSummary");
                const newSummary = summaryEl ? summaryEl.value.trim() : "";
                let updatedSummary = record.work_summary || "";
                if (newSummary !== "") {
                    const fmt = `Session ${sessions.length}: ${newSummary}`;
                    updatedSummary = updatedSummary ? updatedSummary + " | \n" + fmt : fmt;
                }

                await DB.update("attendance", record.id, { sessions: sessions, total_minutes: totalMinutes, work_summary: updatedSummary });
                UI.closeModal(); UI.showToast("Checked Out Successfully", "success"); PRApp.loadDashboard();
            },
            loadHistory: async () => {
                const u = App.currentUser;
                if (!u) return;
                const atts = (await DB.get("attendance") || []).filter(a => a && a.pr_id === u.pr_id).sort((a, b) => new Date(b.date) - new Date(a.date));
                let html = "";
                atts.forEach(a => {
                    const sessions = a.sessions || [];
                    let sessionList = "-";
                    if (sessions.length > 0) {
                        sessionList = sessions.map((s, index) => {
                            const inTime = s.check_in ? new Date(s.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
                            const outTime = s.check_out ? new Date(s.check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
                            return `#${index + 1}: ${inTime} → ${outTime}`;
                        }).join("<br>");
                    }
                    const totalHours = ((a.total_minutes || 0) / 60).toFixed(2);
                    html += `<tr><td><strong>${a.date}</strong></td><td>${sessionList}</td><td><strong>${totalHours} hrs</strong></td><td><small>${a.work_summary || "-"}</small></td></tr>`;
                });
                const tbody = document.getElementById("tablePRHistory");
                if (tbody) tbody.innerHTML = html || `<tr><td colspan="4" class="text-center">No records found.</td></tr>`;
            },
            calcDays: () => {
                const fEl = document.getElementById('prLFrom');
                const tEl = document.getElementById('prLTo');
                const f = fEl ? fEl.value : ''; 
                const t = tEl ? tEl.value : '';
                const daysEl = document.getElementById('prLDays');
                if (daysEl) {
                    daysEl.innerText = (f && t) ? Math.max(0, Math.ceil((new Date(t) - new Date(f)) / 86400000) + 1) : '0';
                }
            },
            submitLeave: async (e) => {
                e.preventDefault();
                const daysEl = document.getElementById('prLDays');
                const days = parseInt(daysEl ? daysEl.innerText : '0');
                if(isNaN(days) || days <= 0) return UI.showToast('Invalid dates selected.', 'error');

                const btn = e.target.querySelector('button'); 
                const originalText = btn ? btn.innerHTML : '';
                if (btn) {
                    btn.disabled = true; 
                    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Submitting...';
                }

                const result = await DB.insert('pr_leave_requests', { 
                    pr_id: App.currentUser.pr_id, 
                    leave_from: document.getElementById('prLFrom').value, 
                    leave_to: document.getElementById('prLTo').value, 
                    total_days: days, 
                    reason: document.getElementById('prLReason').value, 
                    status: 'Pending' 
                });

                if (btn) {
                    btn.disabled = false; 
                    btn.innerHTML = originalText;
                }
                if (!result) return;
                e.target.reset(); 
                if (daysEl) daysEl.innerText = '0'; 
                UI.showToast('Leave request submitted successfully!', 'success'); PRApp.switchTab('pr-leave-history');
            },
            loadLeaves: async () => {
                const u = App.currentUser;
                if (!u) return;
                const myLeaves = (await DB.get("pr_leave_requests") || []).filter(l => l && l.pr_id === u.pr_id).sort((a, b) => new Date(b.leave_from) - new Date(a.leave_from));
                let html = "";
                myLeaves.forEach(l => {
                    const bc = l.status === 'Approved' ? 'badge-completed' : (l.status === 'Rejected' ? 'badge-absent' : 'badge-pending');
                    html += `<tr><td><strong>${l.leave_from}</strong> to <strong>${l.leave_to}</strong></td><td>${l.total_days}</td><td style="white-space: pre-wrap; max-width: 300px;">${l.reason}</td><td><span class="badge ${bc}">${l.status}</span></td></tr>`;
                });
                const tbody = document.getElementById("tablePRMyLeaves");
                if (tbody) tbody.innerHTML = html || `<tr><td colspan="4" class="text-center text-muted">No leave requests found.</td></tr>`;
            },
            loadNotifications: async () => {
                const u = App.currentUser;
                if (!u) return;
                const { data: targets, error } = await supabaseClient.from('pr_notification_targets').select('*, pr_notifications(*)').eq('pr_id', u.pr_id);
                if (error) return console.error("Failed fetching PR notifications", error);

                targets.sort((a,b) => new Date(b.pr_notifications.created_at) - new Date(a.pr_notifications.created_at));
                let html = '';
                targets.forEach(t => {
                    if (!t || !t.pr_notifications) return;
                    let n = t.pr_notifications;
                    let uClass = n.urgency === 'urgent' ? 'badge-absent' : (n.urgency === 'important' ? 'badge-pending' : 'badge-working');
                    let attachHtml = n.attachment ? `<a href="${n.attachment}" target="_blank" class="btn btn-outline" style="padding: 4px 12px; font-size:12px;"><i class="ph-bold ph-paperclip"></i> View File</a>` : '-';
                    let readBtn = t.is_read ? `<span class="badge badge-completed"><i class="ph-fill ph-checks"></i> Read</span>` : `<button class="btn btn-primary" style="padding: 6px 12px; font-size:12px;" onclick="PRApp.markNotifRead('${t.id}')">Mark Read</button>`;
                    let rowStyle = t.is_read ? '' : 'background: rgba(255, 153, 51, 0.05); font-weight: 500;';

                    html += `<tr style="${rowStyle}">
                        <td>${new Date(n.created_at + 'Z').toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td><strong style="font-size:15px;">${n.title}</strong><br><span class="badge ${uClass}" style="margin-top:6px; display:inline-block; font-size:11px;">${n.urgency.toUpperCase()}</span></td>
                        <td style="white-space: pre-wrap; max-width:300px; line-height:1.5;">${n.message}</td>
                        <td>${attachHtml}</td>
                        <td>${readBtn}</td>
                    </tr>`;
                });
                const tbody = document.getElementById('tablePRMyNotifications');
                if (tbody) tbody.innerHTML = html || '<tr><td colspan="5" class="text-center">You have no new notifications.</td></tr>';
            },
            
           markNotifRead: async (targetId) => {
                await supabaseClient.from('pr_notification_targets').update({ is_read: true }).eq('id', targetId);
                UI.showToast('Notification marked as read.'); PRApp.loadNotifications();
            }, // <-- Ensure you add this comma!
            
            downloadIDCard: () => {
                const u = App.currentUser;
                if (!u) return;
                if (!window.jspdf) return UI.showToast("PDF Library loading...", "warning");
                
                const { jsPDF } = window.jspdf;
                // Standard CR80 ID Card Size (Vertical): 54mm x 86mm
                const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [54, 86] });
                
                // Dark Navy Background
                doc.setFillColor(10, 25, 49); // var(--primary)
                doc.rect(0, 0, 54, 86, 'F');
                
                // Gold Outer Frame & Top Bar
                doc.setFillColor(255, 153, 51); // var(--gold)
                doc.rect(0, 0, 54, 3, 'F');
                doc.setDrawColor(255, 153, 51);
                doc.setLineWidth(0.5);
                doc.roundedRect(2, 5, 50, 79, 2, 2, 'S');

                // Header Text: CHINNAPATRA OFFICIAL
                doc.setTextColor(255, 153, 51); // Gold
                doc.setFontSize(12);
                doc.setFont("helvetica", "bold");
                doc.text("CHINNAPATRA", 27, 13, { align: "center" });
                
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(5.5);
                doc.setFont("helvetica", "normal");
                doc.text("OFFICIAL PR IDENTITY", 27, 17, { align: "center" });
                
                // Subtle divider line
                doc.setDrawColor(255, 255, 255);
                doc.setLineWidth(0.1);
                doc.line(10, 20, 44, 20);
                
                // Avatar Circle
                doc.setFillColor(255, 153, 51); // Gold
                doc.circle(27, 32, 8, 'F');
                doc.setTextColor(10, 25, 49); // Dark blue text for initial
                doc.setFontSize(14);
                doc.setFont("helvetica", "bold");
                doc.text(u.full_name.charAt(0), 27, 34.5, { align: "center" });

                // User Info
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(10);
                doc.text(u.full_name.toUpperCase(), 27, 46, { align: "center" });

                doc.setTextColor(255, 153, 51); // Gold
                doc.setFontSize(6.5);
                doc.text(`${u.role.toUpperCase()} EXECUTIVE`, 27, 50, { align: "center" });

                // Details block
                doc.setFillColor(19, 47, 76); // Secondary dark blue
                doc.roundedRect(5, 54, 44, 18, 2, 2, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(6.5);
                
                // Map details inside the box
                doc.setFont("helvetica", "normal"); doc.text(`ID:`, 8, 59);        
                doc.setFont("helvetica", "bold");   doc.text(`${u.pr_id}`, 18, 59); 
                doc.setFont("helvetica", "normal"); doc.text(`User:`, 8, 64);      
                doc.setFont("helvetica", "bold");   doc.text(`${u.username}`, 18, 64); 
                doc.setFont("helvetica", "normal"); doc.text(`Mob:`, 8, 69);       
                doc.setFont("helvetica", "bold");   doc.text(`${u.mobile}`, 18, 69); 

                // "Chinnapatra Official" Stamp at the bottom
                doc.setTextColor(255, 153, 51); // Gold text
                doc.setFontSize(7);
                doc.setFont("helvetica", "bold");
                doc.setDrawColor(255, 153, 51);
                doc.setLineWidth(0.4);
                // Creating a stamp border and text
                doc.roundedRect(12, 76, 30, 5, 1, 1, 'S');
                doc.text("CHINNAPATRA OFFICIAL", 27, 79.5, { align: "center" });
                
                // Trigger Download
                doc.save(`Chinnapatra_ID_${u.pr_id}.pdf`);
                UI.showToast("Official ID Card Downloaded!", "success");
            }
        };
        const MediaAdmin = {
    workflows: [],
    
    // Sangrahashala List and Prefix Mapping
    sangrahashalaList: {
        'Kothakahon': 'KOT',
        'Kolporekha': 'KOL',
        'Munsinama': 'MUN',
        'Abeger Khata': 'ABE',
        'Ruptakkhor': 'RUP',
        'Mridangam': 'MRI',
        'Surangan': 'SUR',
        'Konthokar': 'KON',
        'Chittankan': 'CHI',
        'Dristikon': 'DRI',
        'Chandaseni': 'CHA',
        'Protifalak': 'PRO'
    },

    init: async () => {
        if (!AdminApp.cachedPRs || AdminApp.cachedPRs.length === 0) {
            AdminApp.cachedPRs = (await DB.get('users') || []).filter(u => u.role === 'PR');
        }
        if (!AdminApp.cachedArtists || AdminApp.cachedArtists.length === 0) {
            AdminApp.cachedArtists = await DB.get('artists') || [];
        }
        MediaAdmin.renderTable();
    },

    renderTable: async () => {
        const data = await DB.get('media_workflows') || [];
        MediaAdmin.workflows = data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        let html = '';
        MediaAdmin.workflows.forEach(w => {
            const scheduler = AdminApp.cachedPRs.find(p => p.pr_id === w.scheduler_pr_id)?.full_name || w.scheduler_pr_id;
            const poster = AdminApp.cachedPRs.find(p => p.pr_id === w.poster_pr_id)?.full_name || w.poster_pr_id;
            
            let artistsHtml = '';
            if (w.artists_data) {
                const arr = typeof w.artists_data === 'string' ? JSON.parse(w.artists_data) : w.artists_data;
                artistsHtml = arr.map(a => `<span style="font-size:11px; background:rgba(200,155,60,0.1); color:var(--gold); padding:2px 6px; border-radius:4px; margin-right:4px; display:inline-block; margin-bottom:4px;">${a.artist_name} (${a.department})</span>`).join('');
            }

            let statusBadge = w.status === 'Posted' ? 'badge-completed' : (w.status === 'Scheduled' ? 'badge-working' : 'badge-absent');
            
            // Format Media Icon
            let mediaIcon = 'ph-file';
            if(w.media_type === 'Video') mediaIcon = 'ph-video-camera';
            if(w.media_type === 'Image') mediaIcon = 'ph-image';
            if(w.media_type === 'Text') mediaIcon = 'ph-text-t';

            html += `<tr>
                <td>
                    <strong style="color:var(--primary); font-size:15px;">${w.work_id}</strong><br>
                    <span style="font-weight:600; font-size:14px;">${w.title}</span><br>
                    <div style="margin-top:6px; font-size:11px; color:var(--text-muted); display:grid; gap:2px;">
                        <span><i class="ph-fill ph-folder" style="color:var(--gold);"></i> <strong>${w.sangrahashala || 'N/A'}</strong></span>
                        <span><i class="ph-fill ${mediaIcon}" style="color:var(--primary);"></i> ${w.media_type || 'N/A'}</span>
                        <span><i class="ph-fill ph-tag" style="color:var(--danger);"></i> Mark: ${w.special_marking}</span>
                    </div>
                </td>
                <td style="max-width:200px;">${artistsHtml}</td>
                <td><small><strong>Scheduler:</strong> ${scheduler}<br><strong>Poster:</strong> ${poster}</small></td>
                <td>
                    <span class="badge ${statusBadge}">${w.status}</span>
                    ${w.schedule_time ? `<br><small style="color:var(--text-muted);"><i class="ph-fill ph-clock"></i> ${w.platform} | ${new Date(w.schedule_time).toLocaleString([], {dateStyle:'short', timeStyle:'short'})}</small>` : ''}
                </td>
                <td>
                    <button class="btn btn-danger btn-sm" style="padding: 6px 12px;" onclick="MediaAdmin.deleteWorkflow('${w.id}')" title="Delete Workflow">
                        <i class="ph-bold ph-trash"></i>
                    </button>
                </td>
            </tr>`;
        });

        const tbody = document.getElementById('tableMediaWorkflows');
        if (tbody) tbody.innerHTML = html || '<tr><td colspan="5" class="text-center text-muted">No workflows created.</td></tr>';
    },

    deleteWorkflow: async (id) => {
        UI.confirm('Delete Media Workflow', 'Are you sure you want to permanently delete this scheduled workflow? This action cannot be undone.', async () => {
            await DB.remove('media_workflows', id);
            UI.showToast('Workflow deleted successfully.', 'success');
            MediaAdmin.renderTable();
        });
    },

    openCreateModal: () => {
        const randomNum = Math.floor(10000 + Math.random() * 90000);
        const workId = `WRK-${randomNum}`;
        
        let prOptions = `<option value="">-- Select PR --</option>`;
        AdminApp.cachedPRs.forEach(pr => prOptions += `<option value="${pr.pr_id}">${pr.full_name} (${pr.pr_id})</option>`);

        let sangrahashalaOptions = `<option value="">-- Select Sangrahashala --</option>`;
        Object.keys(MediaAdmin.sangrahashalaList).forEach(s => {
            sangrahashalaOptions += `<option value="${s}">${s}</option>`;
        });

        UI.showModal('Create New Media Workflow', `
            <form onsubmit="MediaAdmin.saveWorkflow(event)">
                
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:16px;">
                    <div class="form-group">
                        <label class="form-label">Sangrahashala</label>
                        <select id="mwSangrahashala" class="form-control" onchange="MediaAdmin.updateWorkIdPrefix()" required>
                            ${sangrahashalaOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Media Type</label>
                        <select id="mwMediaType" class="form-control" required>
                            <option value="">-- Select --</option>
                            <option value="Video">🎬 Video</option>
                            <option value="Image">🖼️ Image</option>
                            <option value="Text">📝 Text</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Generated Work ID</label>
                        <input type="text" id="mwWorkId" class="form-control" value="${workId}" readonly style="font-weight:bold; color:var(--primary); background:rgba(200,155,60,0.1); border-color:var(--gold);">
                        <input type="hidden" id="mwRandomNum" value="${randomNum}">
                    </div>
                </div>

                <div class="form-group"><label class="form-label">Post Title</label><input type="text" id="mwTitle" class="form-control" required placeholder="Enter the main title for this task"></div>
                
                <div class="form-group" style="background: rgba(10,25,49,0.02); padding: 16px; border-radius: 8px;">
                    <label class="form-label" style="display:flex; justify-content:space-between;">
                        <span>Artists Involved</span>
                        <button type="button" class="btn btn-sm btn-outline" onclick="MediaAdmin.addArtistRow()" style="padding: 2px 8px; font-size:11px;">+ Add Artist</button>
                    </label>
                    <div id="mwArtistsContainer"></div>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                    <div class="form-group"><label class="form-label">Assign Scheduler</label><select id="mwScheduler" class="form-control" required>${prOptions}</select></div>
                    <div class="form-group"><label class="form-label">Assign Poster</label><select id="mwPoster" class="form-control" required>${prOptions}</select></div>
                </div>

                <div class="form-group"><label class="form-label">Special Marking</label>
                    <select id="mwMarking" class="form-control"><option value="Standard">Standard</option><option value="Urgent">Urgent</option><option value="Collab">Collab</option></select>
                </div>
                <div class="form-group"><label class="form-label">Caption / Description</label><textarea id="mwCaption" class="form-control" placeholder="Optional notes or full caption..."></textarea></div>
                
                <button type="submit" class="btn btn-primary" style="width:100%; padding:14px; font-size:16px;"><i class="ph-bold ph-rocket-launch"></i> Create Pipeline</button>
            </form>
        `);
        MediaAdmin.addArtistRow();
    },

    // Dynamically updates Work ID based on Sangrahashala Selection
    updateWorkIdPrefix: () => {
        const sangrahashalaSelect = document.getElementById('mwSangrahashala');
        const workIdInput = document.getElementById('mwWorkId');
        const randomNum = document.getElementById('mwRandomNum').value;
        
        if (sangrahashalaSelect && workIdInput) {
            const selectedVal = sangrahashalaSelect.value;
            if (selectedVal && MediaAdmin.sangrahashalaList[selectedVal]) {
                const prefix = MediaAdmin.sangrahashalaList[selectedVal];
                workIdInput.value = `${prefix}-${randomNum}`;
            } else {
                workIdInput.value = `WRK-${randomNum}`;
            }
        }
    },

    addArtistRow: () => {
        const container = document.getElementById('mwArtistsContainer');
        const rowId = Date.now();
        let artistOpts = `<option value="">Select Artist...</option>`;
        AdminApp.cachedArtists.forEach(a => artistOpts += `<option value="${a.id}">${a.name}</option>`);

        const html = `
            <div class="mw-artist-row" id="mw_row_${rowId}" style="display:flex; gap:12px; margin-bottom:12px;">
                <select class="form-control a-select" style="flex:2;" onchange="MediaAdmin.updateDept(this, ${rowId})" required>${artistOpts}</select>
                <select class="form-control d-select" id="mw_dept_${rowId}" style="flex:2;" required><option value="">Select Dept...</option></select>
                <button type="button" class="btn btn-danger" style="padding: 8px 12px;" onclick="document.getElementById('mw_row_${rowId}').remove()"><i class="ph ph-trash"></i></button>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    },

    updateDept: (selectEl, rowId) => {
        const deptSelect = document.getElementById(`mw_dept_${rowId}`);
        const artist = AdminApp.cachedArtists.find(a => a.id === selectEl.value);
        if (artist && artist.department) {
            deptSelect.innerHTML = artist.department.split(',').map(d => `<option value="${d.trim()}">${d.trim()}</option>`).join('');
        } else {
            deptSelect.innerHTML = '<option value="General">General</option>';
        }
    },

    saveWorkflow: async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.innerHTML = '<i class="ph-bold ph-spinner ph-spin"></i> Saving...'; 
        btn.disabled = true;

        let artistsData = [];
        document.querySelectorAll('.mw-artist-row').forEach(row => {
            const id = row.querySelector('.a-select').value;
            const dept = row.querySelector('.d-select').value;
            const name = AdminApp.cachedArtists.find(a => a.id === id).name;
            artistsData.push({ artist_id: id, artist_name: name, department: dept });
        });

        const payload = {
            work_id: document.getElementById('mwWorkId').value,
            sangrahashala: document.getElementById('mwSangrahashala').value, // NEW DATA
            media_type: document.getElementById('mwMediaType').value, // NEW DATA
            title: document.getElementById('mwTitle').value,
            artists_data: JSON.stringify(artistsData),
            special_marking: document.getElementById('mwMarking').value,
            caption: document.getElementById('mwCaption').value,
            scheduler_pr_id: document.getElementById('mwScheduler').value,
            poster_pr_id: document.getElementById('mwPoster').value,
            status: 'Pending Schedule'
        };

        await DB.insert('media_workflows', payload);
        UI.closeModal();
        UI.showToast('Workflow Created!', 'success');
        MediaAdmin.renderTable();
    },

    exportCSV: (type) => {
        const now = new Date();
        const rows = [["Work ID", "Sangrahashala", "Media Type", "Title", "Status", "Platform", "Schedule Time", "Scheduler PR", "Poster PR", "Artists"]];
        
        let filtered = MediaAdmin.workflows.filter(w => w.schedule_time);

        if (type === 'daily') {
            const today = now.toISOString().split('T')[0];
            filtered = filtered.filter(w => w.schedule_time.startsWith(today));
        } else if (type === 'weekly') {
            const oneWeekAgo = new Date(now.setDate(now.getDate() - 7));
            filtered = filtered.filter(w => new Date(w.schedule_time) >= oneWeekAgo);
        }

        if (filtered.length === 0) return UI.showToast(`No scheduled posts found for this ${type === 'daily' ? 'day' : 'week'}.`, 'warning');

        filtered.forEach(w => {
            const arr = typeof w.artists_data === 'string' ? JSON.parse(w.artists_data) : (w.artists_data || []);
            const artistsStr = arr.map(a => `${a.artist_name} (${a.department})`).join(' | ');
            rows.push([
                w.work_id, 
                w.sangrahashala || 'N/A', 
                w.media_type || 'N/A', 
                w.title, 
                w.status, 
                w.platform || 'N/A', 
                new Date(w.schedule_time).toLocaleString(), 
                w.scheduler_pr_id, 
                w.poster_pr_id, 
                artistsStr
            ]);
        });

        const csvContent = "\uFEFF" + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Media_Schedule_${type}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
const MediaPR = {
    myTasks: [],
    allDepartments: new Set(),

    init: async () => {
        const u = App.currentUser;
        if (!u) return;

        const container = document.getElementById('prMediaTasksContainer');
        
        if (!document.getElementById('pr-media-styles')) {
            const style = document.createElement('style');
            style.id = 'pr-media-styles';
            style.innerHTML = `
                @keyframes slideUpFadeIn { 0% { opacity: 0; transform: translateY(30px) scale(0.98); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
                .media-task-card { transition: all 0.4s; border: 1px solid rgba(255,255,255,0.8); background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); opacity: 0; animation: slideUpFadeIn 0.5s forwards; display: flex; flex-direction: column; }
                .media-task-card:hover { transform: translateY(-6px); box-shadow: var(--shadow-lg); border-color: var(--gold-light); }
                .workflow-tracker { display: flex; justify-content: space-between; margin-bottom: 20px; position: relative; padding: 0 10px; }
                .workflow-step { flex: 1; text-align: center; position: relative; font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
                .workflow-step::after { content: ''; position: absolute; top: 12px; left: 50%; width: 100%; height: 2px; background: rgba(10,25,49,0.1); z-index: 1; transition: background 0.4s; }
                .workflow-step:last-child::after { display: none; }
                .workflow-step .step-icon { width: 26px; height: 26px; border-radius: 50%; background: var(--bg-main); border: 2px solid rgba(10,25,49,0.1); margin: 0 auto 6px auto; display: flex; align-items: center; justify-content: center; position: relative; z-index: 2; transition: all 0.4s; font-size: 12px; }
                .workflow-step.completed .step-icon { background: var(--success); border-color: var(--success); color: white; }
                .workflow-step.completed::after { background: var(--success); }
                .workflow-step.active .step-icon { background: var(--gold); border-color: var(--gold); color: white; box-shadow: 0 0 12px rgba(200,155,60,0.5); }
                .workflow-step.active { color: var(--primary); }
                .dept-stat-card { background: linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.6)); border: 1px solid rgba(200,155,60,0.3); border-radius: 12px; padding: 12px 20px; min-width: 140px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(10px); flex-shrink: 0; }
                .dept-stat-scroll { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 12px; scrollbar-width: thin; }
                .dept-stat-scroll::-webkit-scrollbar { height: 6px; }
                .dept-stat-scroll::-webkit-scrollbar-thumb { background: rgba(200,155,60,0.4); border-radius: 10px; }
            `;
            document.head.appendChild(style);
        }

        container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px;"><i class="ph ph-spinner-gap ph-spin" style="font-size: 40px; color: var(--gold);"></i><br><span style="color: var(--text-muted); margin-top: 12px; display: block; font-weight: 500;">Syncing Pipeline...</span></div>`;

        const data = await DB.get('media_workflows') || [];
        MediaPR.myTasks = data.filter(w => w.scheduler_pr_id === u.pr_id || w.poster_pr_id === u.pr_id);

        if (MediaPR.myTasks.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding: 60px 20px; background: rgba(255,255,255,0.6); backdrop-filter: blur(10px); border-radius: 20px; border: 1px dashed rgba(200,155,60,0.4);">
                    <div style="font-size: 60px; color: var(--gold); margin-bottom: 16px;"><i class="ph-fill ph-party-horn"></i></div>
                    <h3 style="color: var(--primary); font-family: var(--font-heading); font-size: 24px;">All caught up!</h3>
                    <p style="color: var(--text-muted); margin-top: 8px;">You have no pending media tasks at the moment.</p>
                </div>`;
            return;
        }

        let sangCounts = {};
        MediaPR.myTasks.forEach(w => {
            const sangId = w.sangrahashala || 'Uncategorized';
            sangCounts[sangId] = (sangCounts[sangId] || 0) + 1;
        });

        let topDashboardHtml = '';
        const sangKeys = Object.keys(sangCounts).sort();
        
        if (sangKeys.length > 0) {
            let cardsHtml = sangKeys.map(s => `
                <div class="dept-stat-card">
                    <div style="font-size: 28px; font-weight: bold; color: var(--primary); font-family: var(--font-heading); line-height: 1;">${sangCounts[s]}</div>
                    <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; text-align: center; margin-top: 6px; letter-spacing: 0.5px;">${s}</div>
                </div>
            `).join('');

            topDashboardHtml = `
                <div style="grid-column: 1/-1; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                        <i class="ph-fill ph-folder-star" style="color: var(--gold); font-size: 20px;"></i>
                        <h3 style="font-size: 15px; font-weight: 700; color: var(--primary); text-transform: uppercase; margin: 0; letter-spacing: 0.5px;">Sangrahashala Overview</h3>
                    </div>
                    <div class="dept-stat-scroll">
                        <div class="dept-stat-card" style="background: rgba(10,25,49,0.05); border-color: rgba(10,25,49,0.1);">
                            <div style="font-size: 28px; font-weight: bold; color: var(--primary); font-family: var(--font-heading); line-height: 1;">${MediaPR.myTasks.length}</div>
                            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; text-align: center; margin-top: 6px; letter-spacing: 0.5px;">Total Tasks</div>
                        </div>
                        ${cardsHtml}
                    </div>
                </div>
            `;
        }

        let filterOptions = `<option value="">All Sangrahashalas</option>`;
        sangKeys.forEach(s => { filterOptions += `<option value="${s}">${s}</option>`; });

        // ADDED: Export PDF Button in Filter Bar
        const filterHtml = `
            <div style="grid-column: 1/-1; display:flex; flex-wrap:wrap; gap:16px; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.7); padding:12px 16px; border-radius:12px; box-shadow:var(--shadow-sm); border:1px solid rgba(200,155,60,0.2);">
                <div style="flex:1; min-width: 250px; position:relative;">
                    <i class="ph-bold ph-magnifying-glass" style="position:absolute; left:12px; top:12px; color:var(--text-muted);"></i>
                    <input type="text" id="prMediaSearch" class="form-control" placeholder="Search by Title, Work ID, or Artist..." oninput="MediaPR.renderTasks()" style="padding-left:36px; border-color:var(--gold-light);">
                </div>
                <div style="display:flex; gap:12px; flex-wrap:wrap;">
                    <select id="prMediaSangFilter" class="form-control" style="width:200px; border-color:var(--gold);" onchange="MediaPR.renderTasks()">
                        ${filterOptions}
                    </select>
                    <button class="btn btn-outline" style="border-color:var(--primary); color:var(--primary);" onclick="MediaPR.openExportModal()"><i class="ph-bold ph-download-simple"></i> Schedule PDF</button>
                </div>
            </div>
        `;

        container.innerHTML = topDashboardHtml + filterHtml + `<div id="prMediaCardsWrapper" style="grid-column: 1/-1; display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px;"></div>`;
        MediaPR.renderTasks();
    },

    renderTasks: () => {
        const u = App.currentUser;
        if (!u) return;

        const wrapper = document.getElementById('prMediaCardsWrapper');
        const filterVal = document.getElementById('prMediaSangFilter').value;
        const searchVal = document.getElementById('prMediaSearch').value.toLowerCase();
        if (!wrapper) return;

        wrapper.innerHTML = '';
        
        let filteredTasks = MediaPR.myTasks;
        
        if (filterVal) filteredTasks = filteredTasks.filter(w => w.sangrahashala === filterVal);
        if (searchVal) {
            filteredTasks = filteredTasks.filter(w => 
                (w.title && w.title.toLowerCase().includes(searchVal)) || 
                (w.work_id && w.work_id.toLowerCase().includes(searchVal)) ||
                (w.artists_data && w.artists_data.toLowerCase().includes(searchVal)) ||
                (w.platform && w.platform.toLowerCase().includes(searchVal))
            );
        }

        filteredTasks.sort((a, b) => {
            const sangA = a.sangrahashala || '';
            const sangB = b.sangrahashala || '';
            if (sangA < sangB) return -1;
            if (sangA > sangB) return 1;
            return new Date(b.created_at) - new Date(a.created_at);
        });

        if (filteredTasks.length === 0) {
            wrapper.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:30px; color:var(--text-muted);">No tasks match your search or filter.</div>`;
            return;
        }

        // টাইমলাইন অ্যানিমেশন এর জন্য CSS
        let html = `
            <style>
                @keyframes fillProgressPR { from { width: 0%; } }
                @keyframes pulseAccent { 0% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(212, 175, 55, 0); } 100% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0); } }
                .pr-line-fill { animation: fillProgressPR 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                .pr-step-active { animation: pulseAccent 2s infinite; border-color: var(--gold) !important; background: var(--white) !important; color: var(--gold) !important; }
                .pr-step-done { background: var(--gold) !important; color: var(--white) !important; border-color: var(--gold) !important; }
                .pr-step-future { background: var(--bg-main) !important; color: #9CA3AF !important; border-color: #E5E7EB !important; }
            </style>
        `;
        
        // Kolkata Timezone Set
        const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));

        filteredTasks.forEach((w, index) => {
            const isScheduler = w.scheduler_pr_id === u.pr_id;
            const isPoster = w.poster_pr_id === u.pr_id;
            const delay = index * 0.05;

            const createdDateStr = new Date(w.created_at).toLocaleString("en-US", {timeZone: "Asia/Kolkata"});
            const createdDate = new Date(createdDateStr);
            const daysOld = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
            let oldTaskBadge = daysOld >= 30 ? `<span class="badge badge-absent" style="font-size:10px; margin-bottom:8px;"><i class="ph-bold ph-warning-circle"></i> OLD TASK (${daysOld} Days)</span>` : '';

            const assignedDateStr = createdDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
            
            let mediaIcon = 'ph-file';
            if(w.media_type === 'Video') mediaIcon = 'ph-video-camera';
            if(w.media_type === 'Image') mediaIcon = 'ph-image';
            if(w.media_type === 'Text') mediaIcon = 'ph-text-t';

            let artistsHtml = '';
            if (w.artists_data) {
                try {
                    const arr = typeof w.artists_data === 'string' ? JSON.parse(w.artists_data) : w.artists_data;
                    artistsHtml = arr.map(a => `<span style="background: rgba(10,25,49,0.04); border: 1px solid rgba(10,25,49,0.1); color: var(--primary); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; margin: 0 6px 6px 0;"><i class="ph-fill ph-user-circle" style="color: var(--gold);"></i> ${a.artist_name} <span style="color: var(--text-muted); font-weight: 500; border-left: 1px solid rgba(10,25,49,0.2); padding-left: 4px; margin-left: 2px;">${a.department || 'General'}</span></span>`).join('');
                } catch(e) {}
            }

            // Timeline calculations
            let progressWidth = '0%';
            let step2Icon = 'ph-calendar';
            let step3Icon = 'ph-rocket-launch';
            let step2Class = 'pr-step-future';
            let step3Class = 'pr-step-future';

            if (w.status === 'Pending Schedule') {
                progressWidth = '33%';
                step2Class = 'pr-step-active';
                step2Icon = 'ph-spinner ph-spin';
            } else if (w.status === 'Scheduled') {
                progressWidth = '66%';
                step2Class = 'pr-step-done';
                step3Class = 'pr-step-active';
                step2Icon = 'ph-calendar-check';
                step3Icon = 'ph-spinner ph-spin';
            } else if (w.status === 'Posted') {
                progressWidth = '100%';
                step2Class = 'pr-step-done';
                step3Class = 'pr-step-done';
                step2Icon = 'ph-calendar-check';
                step3Icon = 'ph-check-circle';
            }

            let schedulerBtn = '';
            let posterBtn = '';
            let cardAccent = 'var(--primary)';

            if (isScheduler) {
                if (w.status === 'Pending Schedule') {
                    cardAccent = 'var(--gold)';
                    schedulerBtn = `<button class="btn btn-primary ripple-btn" style="width:100%; padding: 10px; font-size: 13px;" onclick="MediaPR.openScheduleModal('${w.id}')"><i class="ph-bold ph-calendar-plus"></i> Schedule Now</button>`;
                } else if (w.status === 'Scheduled') {
                    schedulerBtn = `<button class="btn btn-outline ripple-btn" style="width:100%; padding: 10px; font-size: 13px; border-color:var(--gold); color:var(--gold);" onclick="MediaPR.openScheduleModal('${w.id}')"><i class="ph-bold ph-calendar-edit"></i> Reschedule</button>`;
                }
            }
            if (isPoster && w.status === 'Scheduled') {
                cardAccent = 'var(--warning)';
                posterBtn = `<button class="btn btn-success ripple-btn" style="width:100%; padding: 10px; font-size: 13px;" onclick="MediaPR.markPosted('${w.id}')"><i class="ph-bold ph-rocket-launch"></i> Execute & Post</button>`;
            }

            let finalActionArea = '';
            if (w.status === 'Posted') {
                cardAccent = 'var(--success)';
                finalActionArea = `<div style="text-align:center; padding: 10px; background: rgba(16,185,129,0.1); color: var(--success); border-radius: var(--radius-pill); font-weight: 600; font-size: 13px;"><i class="ph-fill ph-check-circle"></i> Pipeline Completed</div>`;
            } else {
                if (schedulerBtn || posterBtn) {
                    finalActionArea = `<div style="display:flex; flex-direction:column; gap:8px;">${schedulerBtn}${posterBtn}</div>`;
                } else {
                    finalActionArea = `<div style="text-align:center; padding: 10px; background: rgba(10,25,49,0.05); color: var(--text-muted); border-radius: var(--radius-pill); font-weight: 600; font-size: 13px;"><i class="ph ph-hourglass"></i> Waiting on other PR</div>`;
                }
            }

            let markBadge = '';
            if (w.special_marking && w.special_marking !== 'Standard') {
                const markColor = w.special_marking === 'Urgent' ? 'var(--danger)' : 'var(--gold)';
                const markIcon = w.special_marking === 'Urgent' ? 'ph-siren' : 'ph-star';
                markBadge = `<span style="display:inline-flex; align-items:center; gap:4px; background: ${markColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase;"><i class="ph-fill ${markIcon}"></i> ${w.special_marking}</span>`;
            }

            let scheduleInfo = '';
            if (w.fb_time || w.insta_time) {
                const formatIST = (isoStr) => {
                    if(!isoStr) return '';
                    return new Date(new Date(isoStr).toLocaleString("en-US", {timeZone: "Asia/Kolkata"})).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
                };

                let fbHtml = w.fb_time ? `<div style="display:flex; justify-content:space-between; font-size:12px; font-weight:600; color:#1877F2; margin-bottom:4px;"><span style="display:flex; align-items:center; gap:4px;"><i class="ph-fill ph-facebook-logo"></i> Facebook</span> <span>${formatIST(w.fb_time)}</span></div>` : '';
                let instaHtml = w.insta_time ? `<div style="display:flex; justify-content:space-between; font-size:12px; font-weight:600; color:#E4405F;"><span style="display:flex; align-items:center; gap:4px;"><i class="ph-fill ph-instagram-logo"></i> Instagram</span> <span>${formatIST(w.insta_time)}</span></div>` : '';
                
                scheduleInfo = `
                    <div style="background: rgba(10,25,49,0.03); padding: 12px; border-radius: 8px; border-left: 3px solid var(--primary); margin-bottom: 16px;">
                        ${fbHtml}
                        ${instaHtml}
                    </div>
                `;
            }

            html += `
                <div class="content-card media-task-card" style="border-top: 4px solid ${cardAccent}; animation-delay: ${delay}s; padding-top:16px;">
                    
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 12px;">
                        <div>
                            <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); letter-spacing: 1px;">${w.work_id}</span>
                            <h3 style="color: var(--primary); font-size: 18px; margin-top: 2px; font-family: var(--font-heading); line-height: 1.3;">${w.title}</h3>
                        </div>
                        <div style="text-align:right; flex-shrink:0;">
                            ${oldTaskBadge}
                            <div style="font-size:10px; font-weight:bold; color:var(--text-muted); background:rgba(0,0,0,0.05); padding:2px 8px; border-radius:12px; margin-bottom:4px;"><i class="ph-bold ph-calendar-blank"></i> ASSIGNED: ${assignedDateStr}</div>
                            ${markBadge}
                        </div>
                    </div>

                    <div style="display:flex; gap:12px; margin-bottom:16px; font-size:12px; font-weight:600; color:var(--primary);">
                        <span><i class="ph-fill ph-folder-star" style="color:var(--gold);"></i> ${w.sangrahashala || 'Uncategorized'}</span>
                        <span><i class="ph-fill ${mediaIcon}" style="color:var(--text-muted);"></i> ${w.media_type || 'N/A'}</span>
                    </div>

                    <!-- Animated Timeline -->
                    <div style="position: relative; margin-bottom: 24px; padding-bottom: 10px;">
                        <div style="position: absolute; top: 14px; left: 15%; right: 15%; height: 3px; background: #E5E7EB; z-index: 1; border-radius: 2px;"></div>
                        <div class="pr-line-fill" style="position: absolute; top: 14px; left: 15%; width: ${progressWidth}; max-width: 70%; height: 3px; background: var(--gold); z-index: 2; border-radius: 2px;"></div>
                        
                        <div style="display: flex; justify-content: space-between; position: relative; z-index: 3;">
                            <div style="display: flex; flex-direction: column; align-items: center; width: 33%;">
                                <div class="pr-step-done" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid; display: flex; justify-content: center; align-items: center; font-size: 14px; margin-bottom: 8px; background: var(--white);"><i class="ph-bold ph-file-text"></i></div>
                                <span style="font-size: 11px; font-weight: 700; color: var(--primary);">Assigned</span>
                            </div>
                            <div style="display: flex; flex-direction: column; align-items: center; width: 33%;">
                                <div class="${step2Class}" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid; display: flex; justify-content: center; align-items: center; font-size: 14px; margin-bottom: 8px; background: var(--white); transition:0.3s;"><i class="ph-bold ${step2Icon}"></i></div>
                                <span style="font-size: 11px; font-weight: 700; color: ${w.status === 'Pending Schedule' ? 'var(--gold)' : 'var(--primary)'};">Scheduled</span>
                            </div>
                            <div style="display: flex; flex-direction: column; align-items: center; width: 33%;">
                                <div class="${step3Class}" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid; display: flex; justify-content: center; align-items: center; font-size: 14px; margin-bottom: 8px; background: var(--white); transition:0.3s;"><i class="ph-bold ${step3Icon}"></i></div>
                                <span style="font-size: 11px; font-weight: 700; color: ${w.status === 'Posted' ? 'var(--primary)' : '#9CA3AF'};">Posted</span>
                            </div>
                        </div>
                    </div>
                    
                    ${scheduleInfo}

                    <div style="margin-bottom: 16px;">
                        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">Artists Involved</div>
                        <div>${artistsHtml}</div>
                    </div>
                    
                    ${w.caption ? `
                        <div style="background: rgba(10,25,49,0.02); padding: 12px; border-radius: 8px; border-left: 2px dashed rgba(10,25,49,0.2); margin-bottom: 20px; position: relative;">
                            <i class="ph-fill ph-quotes" style="position: absolute; top: -8px; left: 10px; color: var(--gold); background: white; padding: 0 4px;"></i>
                            <div style="font-size: 13px; color: var(--text-dark); line-height: 1.5; font-style: italic; white-space: pre-wrap;">${w.caption}</div>
                        </div>
                    ` : '<div style="margin-bottom: 20px;"></div>'}
                    
                    <div style="margin-top: auto;">${finalActionArea}</div>
                </div>
            `;
        });
        wrapper.innerHTML = html;
    },

    toggleScheduleInputs: () => {
        const fbChecked = document.getElementById('chkFb').checked;
        const instaChecked = document.getElementById('chkInsta').checked;
        
        const fbArea = document.getElementById('schFbArea');
        const instaArea = document.getElementById('schInstaArea');
        
        if(fbChecked) { fbArea.style.display = 'block'; } 
        else { fbArea.style.display = 'none'; }
        
        if(instaChecked) { instaArea.style.display = 'block'; } 
        else { instaArea.style.display = 'none'; }
    },

    openScheduleModal: (id) => {
        const w = MediaPR.myTasks.find(x => x.id === id);
        if(!w) return;

        const fbChecked = w.fb_time ? 'checked' : '';
        const instaChecked = w.insta_time ? 'checked' : '';
        
        // Modal a Time dekhabar jonno calculation
        const getOffsetTime = (isoString) => {
            if (!isoString) return '';
            const d = new Date(isoString);
            return new Date(d.getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        };

        const fbVal = getOffsetTime(w.fb_time);
        const instaVal = getOffsetTime(w.insta_time);

        UI.showModal('Plan Media Schedule', `
            <div style="text-align:center; margin-bottom: 24px;">
                <div style="font-size: 40px; color: var(--gold); margin-bottom: 4px;"><i class="ph-fill ph-calendar-plus"></i></div>
                <h3 style="font-family: var(--font-heading); color: var(--primary); font-size:20px;">Set Post Details</h3>
                <p style="font-size: 12px; color: var(--text-muted);">Update caption and configure platform schedules.</p>
            </div>
            <form onsubmit="MediaPR.saveSchedule(event, '${id}')">
                
                <div class="form-group" style="margin-bottom: 16px;">
                    <label class="form-label">Post Caption (Bengali Supported)</label>
                    <textarea id="prScheduleCaption" class="form-control" rows="4" placeholder="Write or update the post caption here...">${w.caption || ''}</textarea>
                </div>

                <div class="form-group">
                    <label class="form-label">Select Platforms to Schedule</label>
                    <div style="display:flex; gap:16px; margin-bottom:12px; background:var(--bg-main); padding:12px; border-radius:8px; border:1px solid #E5E7EB;">
                        <label style="display:flex; align-items:center; gap:6px; font-weight:600; cursor:pointer;">
                            <input type="checkbox" id="chkFb" onchange="MediaPR.toggleScheduleInputs()" style="width:18px; height:18px;" ${fbChecked}> 
                            <i class="ph-fill ph-facebook-logo" style="color:#1877F2; font-size:20px;"></i> Facebook
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; font-weight:600; cursor:pointer;">
                            <input type="checkbox" id="chkInsta" onchange="MediaPR.toggleScheduleInputs()" style="width:18px; height:18px;" ${instaChecked}> 
                            <i class="ph-fill ph-instagram-logo" style="color:#E4405F; font-size:20px;"></i> Instagram
                        </label>
                    </div>
                </div>

                <div id="schFbArea" class="form-group" style="display:${w.fb_time ? 'block' : 'none'}; background: rgba(24, 119, 242, 0.05); padding: 12px; border-radius: 8px; border-left: 3px solid #1877F2;">
                    <label class="form-label" style="color:#1877F2;">Facebook Upload Date & Time</label>
                    <input type="datetime-local" id="prFbTime" class="form-control" value="${fbVal}">
                </div>

                <div id="schInstaArea" class="form-group" style="display:${w.insta_time ? 'block' : 'none'}; background: rgba(228, 64, 95, 0.05); padding: 12px; border-radius: 8px; border-left: 3px solid #E4405F;">
                    <label class="form-label" style="color:#E4405F;">Instagram Upload Date & Time</label>
                    <input type="datetime-local" id="prInstaTime" class="form-control" value="${instaVal}">
                </div>

                <div style="background: rgba(10,25,49,0.03); padding: 12px; border-radius: 8px; font-size: 12px; color: var(--text-muted); margin-bottom: 24px; display: flex; gap: 8px; align-items: flex-start;">
                    <i class="ph-fill ph-info" style="color: var(--primary); font-size: 16px;"></i>
                    <span>Once scheduled, this task will be forwarded to the assigned Poster PR to execute at the requested times.</span>
                </div>
                <button type="submit" class="btn btn-primary ripple-btn" style="width:100%; padding: 14px; font-size: 15px;">Lock in Schedule <i class="ph-bold ph-arrow-right"></i></button>
            </form>
        `);
    },

    saveSchedule: async (e, id) => {
        e.preventDefault();
        
        const fbChecked = document.getElementById('chkFb').checked;
        const instaChecked = document.getElementById('chkInsta').checked;
        
        if (!fbChecked && !instaChecked) {
            return UI.showToast('Please select at least one platform to schedule.', 'error');
        }

        const fbTimeInput = document.getElementById('prFbTime').value;
        const instaTimeInput = document.getElementById('prInstaTime').value;

        if ((fbChecked && !fbTimeInput) || (instaChecked && !instaTimeInput)) {
            return UI.showToast('Please set the date and time for the selected platforms.', 'error');
        }

        // Database Platform String Generator
        let platformString = '';
        if (fbChecked && instaChecked) platformString = 'Facebook & Instagram';
        else if (fbChecked) platformString = 'Facebook';
        else if (instaChecked) platformString = 'Instagram';

        // Local Time to UTC conversion for Database
        const convertToUTCString = (localTimeVal) => {
            if(!localTimeVal) return null;
            return new Date(localTimeVal).toISOString();
        };

        const fbTime = fbChecked ? convertToUTCString(fbTimeInput) : null;
        const instaTime = instaChecked ? convertToUTCString(instaTimeInput) : null;

        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Saving...';
        btn.disabled = true;

        const payload = {
            caption: document.getElementById('prScheduleCaption').value,
            platform: platformString, 
            fb_time: fbTime,
            insta_time: instaTime,
            status: 'Scheduled'
        };

        try {
            await DB.update('media_workflows', id, payload);
            UI.closeModal();
            UI.showToast('Work Scheduled successfully!', 'success');
            MediaPR.init();
        } catch(err) {
            UI.showToast('Failed to save schedule. Check database restrictions.', 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    markPosted: async (id) => {
        UI.confirm('Confirm Execution', `
            <div style="text-align: center; margin-bottom: 12px;">
                <div style="font-size: 48px; color: var(--success); margin-bottom: 12px;"><i class="ph-fill ph-rocket-launch"></i></div>
                <strong style="font-size: 16px; color: var(--primary);">Confirm Upload</strong>
            </div>
            Have you successfully uploaded the media to the scheduled platforms? This action cannot be undone.`, 
            async () => {
                await DB.update('media_workflows', id, { status: 'Posted' });
                UI.showToast('Pipeline Completed! Excellent work.', 'success');
                MediaPR.init();
        });
    },
    // ==========================================
    // 3. EXPORT SCHEDULE PDF (BENGALI SUPPORTED)
    // ==========================================
    openExportModal: () => {
        const today = new Date().toISOString().split('T')[0];
        UI.showModal('Export Schedule Data', `
            <div style="text-align:center; margin-bottom: 20px;">
                <div style="font-size: 40px; color: var(--gold); margin-bottom: 4px;"><i class="ph-fill ph-file-pdf"></i></div>
                <h3 style="color: var(--primary); font-family: var(--font-heading);">Download Schedule</h3>
                <p style="font-size: 12px; color: var(--text-muted);">Select a date to generate the schedule sheet (Supports Bengali).</p>
            </div>
            <form onsubmit="MediaPR.generateBengaliPDF(event)">
                <div class="form-group">
                    <label class="form-label">Select Target Date</label>
                    <input type="date" id="prExportDate" class="form-control" value="${today}" required>
                </div>
                <button type="submit" class="btn btn-primary ripple-btn" style="width:100%; padding: 12px;"><i class="ph-bold ph-printer"></i> Generate & Print Report</button>
            </form>
        `);
    },

    generateBengaliPDF: (e) => {
        e.preventDefault();
        const date = document.getElementById('prExportDate').value;
        if(!date) return UI.showToast('Please select a date', 'error');

        // Filter for tasks scheduled on that exact date (checks both FB and Insta times)
        const printTasks = MediaPR.myTasks.filter(w => {
            if(!w.fb_time && !w.insta_time) return false;
            const fbMatch = w.fb_time && w.fb_time.startsWith(date);
            const instaMatch = w.insta_time && w.insta_time.startsWith(date);
            return fbMatch || instaMatch;
        });

        if(printTasks.length === 0) {
            UI.closeModal();
            return UI.showToast('No posts scheduled for this specific date.', 'warning');
        }

        // Generate an HTML document that the browser prints to PDF perfectly with native OS Bengali fonts
        let printWindow = window.open('', '_blank');
        let html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Chinnapatra_Schedule_Report_${date}</title>
                <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
                <style>
                    :root {
                        --primary: #0b1938;
                        --gold: #c89b3c;
                    }
                    body { 
                        font-family: 'Poppins', sans-serif; 
                        padding: 20px; /* Reduced for screen view */
                        color: #2b2b2b; 
                        background: #ffffff;
                        -webkit-print-color-adjust: exact; 
                        print-color-adjust: exact;
                        position: relative;
                        min-height: 100vh;
                    }
                    
                    /* --- MASSIVE CHINNAPATRA WATERMARK --- */
                    .watermark {
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%) rotate(-35deg);
                        font-size: 110px;
                        font-family: 'Playfair Display', serif;
                        font-weight: 700;
                        color: rgba(200, 155, 60, 0.05); /* Extremely subtle gold */
                        z-index: -10;
                        white-space: nowrap;
                        pointer-events: none;
                        text-align: center;
                        line-height: 1;
                    }
                    .watermark span {
                        display: block;
                        font-size: 36px;
                        letter-spacing: 20px;
                        font-family: 'Poppins', sans-serif;
                        margin-top: 10px;
                    }

                    /* --- OFFICIAL HEADER --- */
                    .header-container {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                        border-bottom: 3px solid var(--primary);
                        padding-bottom: 16px;
                        margin-bottom: 20px;
                        position: relative;
                    }
                    .header-container::after {
                        content: ''; position: absolute; bottom: -6px; left: 0; width: 100%; height: 1px; background: var(--gold);
                    }
                    .brand-title {
                        margin: 0; font-family: 'Playfair Display', serif; font-size: 32px; color: var(--primary); line-height: 1.1;
                    }
                    .brand-subtitle {
                        color: var(--gold); font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;
                    }
                    .report-meta { text-align: right; }
                    .report-title {
                        font-size: 16px; font-weight: 700; color: var(--primary); margin: 0 0 4px 0; text-transform: uppercase;
                    }
                    .report-date {
                        font-size: 12px; color: #555; font-weight: 600; background: rgba(200, 155, 60, 0.1); padding: 4px 12px; border-radius: 4px; display: inline-block; border: 1px solid rgba(200,155,60,0.3);
                    }

                    /* --- PREMIUM TABLE --- */
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; z-index: 1; position: relative; box-shadow: 0 4px 15px rgba(0,0,0,0.02); }
                    th, td { border: 1px solid #e2e8f0; padding: 12px 10px; text-align: left; vertical-align: top; }
                    th { 
                        background-color: var(--primary) !important; 
                        color: var(--gold) !important; 
                        font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;
                    }
                    tr:nth-child(even) td { background-color: #f8fafc !important; }
                    td { font-size: 12px; color: #1e293b; }
                    .work-id { font-weight: 700; color: var(--primary); font-size: 14px; }
                    .sangrahashala-tag { display: inline-block; font-size: 10px; color: var(--gold); font-weight: 700; text-transform: uppercase; margin-top: 4px; letter-spacing: 0.5px; }
                    .caption-text { white-space: pre-wrap; line-height: 1.5; font-style: italic; color: #334155; }
                    .time-badge { font-weight: 600; font-size: 11px; margin-bottom: 6px; display: block; }
                    .fb-time { color: #1877F2; }
                    .ig-time { color: #E4405F; }
                    
                    /* --- FOOTER & SIGNATURE --- */
                    .footer {
                        margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; color: #475569; page-break-inside: avoid;
                    }
                    .signature-box { text-align: right; }
                    .sig-line { width: 200px; border-top: 1px solid #1e293b; margin-bottom: 8px; margin-left: auto; }
                    .sig-name { font-weight: 700; color: var(--primary); font-size: 15px; margin: 0; }
                    .sig-role { color: var(--gold); font-weight: 700; font-size: 10px; text-transform: uppercase; margin: 2px 0 0 0; letter-spacing: 1px; }
                    .sig-auth { color: #64748b; font-size: 9px; margin-top: 4px; font-style: italic; }

                    /* --- NARROW PRINT MARGINS --- */
                    @media print {
                        body { padding: 0; }
                        /* Set page to A4 and force narrow margins (8mm) */
                        @page { size: A4 portrait; margin: 8mm; }
                    }
                </style>
            </head>
            <body>
                <!-- Background Watermark -->
                <div class="watermark">
                    CHINNAPATRA
                    <span>OFFICIAL</span>
                </div>

                <!-- Letterhead Header -->
                <div class="header-container">
                    <div>
                        <h1 class="brand-title">CHINNAPATRA</h1>
                        <div class="brand-subtitle">Public Relations & Media Desk</div>
                    </div>
                    <div class="report-meta">
                        <h2 class="report-title">Daily Media Schedule</h2>
                        <div class="report-date">Target Date: ${date}</div>
                    </div>
                </div>

                <!-- Schedule Table -->
                <table>
                    <thead>
                        <tr>
                            <th style="width: 20%;">Work ID & Info</th>
                            <th style="width: 50%;">Approved Post Caption</th>
                            <th style="width: 30%;">Scheduled Upload Time</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        printTasks.forEach(w => {
            let timesHtml = '';
            if(w.fb_time) {
                // Strip the trailing Z or +00:00 to force local time parsing
                const cleanFb = w.fb_time.replace(/(Z|\+00:00)$/, '');
                const fT = new Date(cleanFb).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                timesHtml += `<span class="time-badge fb-time">📘 Facebook: ${fT}</span>`;
            }
            if(w.insta_time) {
                // Strip the trailing Z or +00:00 to force local time parsing
                const cleanInsta = w.insta_time.replace(/(Z|\+00:00)$/, '');
                const iT = new Date(cleanInsta).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                timesHtml += `<span class="time-badge ig-time">📸 Instagram: ${iT}</span>`;
            }

            html += `
                <tr>
                    <td>
                        <span class="work-id">${w.work_id}</span><br>
                        <span class="sangrahashala-tag">${w.sangrahashala || 'General'}</span>
                    </td>
                    <td class="caption-text">"${w.caption || 'No caption provided'}"</td>
                    <td>${timesHtml}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
                
                <!-- Footer & Signature Block -->
                <div class="footer">
                    <div>
                        <strong>Generated by:</strong> ${App.currentUser.full_name}<br>
                        <span style="font-size: 10px; color: #94a3b8;">Printed on: ${new Date().toLocaleString()}</span>
                    </div>
                    <div class="signature-box">
                        <p class="sig-name">Chinnapatra Offical</p>
                        <p class="sig-role">PR DESK</p>
                        <p class="sig-auth">Authorized Signature</p>
                    </div>
                </div>

                <!-- Auto-Print Script -->
                <script>
                    window.onload = function() { 
                        setTimeout(() => {
                            window.print();
                        }, 800); // 800ms delay to ensure web-fonts load perfectly before print dialog opens
                    }
                </script>
            </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
        UI.closeModal();
    }
};

        // --- CLOCK ---
        const LiveClock = {
            init: () => { LiveClock.tick(); setInterval(LiveClock.tick, 1000); },
            tick: () => {
                const now = new Date();
                let hours = now.getHours(); const ampm = hours >= 12 ? 'PM' : 'AM'; hours = hours % 12 || 12; 
                const timeHtml = `${hours}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')} <span style="font-size: 12px; color: var(--gold);">${ampm}</span>`;
                const dateHtml = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()]}, ${now.getDate().toString().padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][now.getMonth()]} ${now.getFullYear()}`;

                const adminTime = document.getElementById('adminTime');
                const adminDate = document.getElementById('adminDate');
                const prTime = document.getElementById('prTime');
                const prDate = document.getElementById('prDate');

                if (adminTime) adminTime.innerHTML = timeHtml;
                if (adminDate) adminDate.innerText = dateHtml;
                if (prTime) prTime.innerHTML = timeHtml;
                if (prDate) prDate.innerText = dateHtml;
            }
        };

        window.onload = () => { App.init(); };



