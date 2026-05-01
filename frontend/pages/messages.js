import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import NotificationToast from '../components/NotificationToast';
import Navbar from '../components/Navbar';
import { apiClient, ApiError } from '../utils/apiClient';
import { encryptMessage, decryptMessage } from '../utils/e2ee';

const COMMON_EMOJIS = [
  '😊', '😂', '❤️', '👍', '🎉', '🙏', '👋', '🔥',
  '😍', '🤔', '😎', '😢', '😡', '🤗', '👏', '💪',
  '😴', '🤣', '😭', '😱', '🤩', '😇', '🤪', '😅'
];

const formatTime = (dateString) =>
  new Date(dateString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

const Messages = () => {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchUsers, setSearchUsers] = useState('');
  const [foundUsers, setFoundUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [lastMessageId, setLastMessageId] = useState(null);
  const [readConversationIds, setReadConversationIds] = useState(new Set());
  // Backoff flag: timestamp (ms) until which polling should be suppressed after a 429.
  const pollBackoffUntilRef = useRef(0);
  const pollingRef = useRef(null);
  const convPollingRef = useRef(null);
  const sseRef = useRef(null);
  const sseBackoffRef = useRef(2000); // SSE reconnect backoff in ms, starts at 2 s
  const sseTimerRef = useRef(null);
  const { user, isLoading: authLoading, privateKeyRef, e2eeReady } = useContext(AuthContext);
  const router = useRouter();
  // Cache recipient public keys: { [userId]: base64PublicKey }
  const pubKeyCache = useRef({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef(null);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const selectedConvRef = useRef(null);

  // Keep a ref in sync so SSE handler can read current conversation without stale closure.
  useEffect(() => { selectedConvRef.current = selectedConversation; }, [selectedConversation]);

  const addNotification = (message, type = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const fetchConversations = useCallback(async (silent = false) => {
    if (typeof window === 'undefined') return;
    // Respect rate-limit backoff.
    if (Date.now() < pollBackoffUntilRef.current) return;
    try {
      if (!silent) setLoading(true);
      const data = await apiClient.get('/api/messages/conversations');
      setConversations(Array.isArray(data) ? data : data.conversations || []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        // Back off for 60 s on rate-limit response.
        pollBackoffUntilRef.current = Date.now() + 60000;
        if (!silent) addNotification('Too many requests. Pausing for 60 seconds.', 'error');
      } else if (!silent) {
        addNotification('Error loading conversations', 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Fetch and cache a user's public key. Always keyed by string ID.
  const getRecipientPublicKey = useCallback(async (userId) => {
    const id = String(userId);
    if (pubKeyCache.current[id]) return pubKeyCache.current[id];
    try {
      const data = await apiClient.get(`/api/users/${id}/public-key`);
      if (data.publicKey) pubKeyCache.current[id] = data.publicKey;
      return data.publicKey ?? null;
    } catch {
      return null;
    }
  }, []);

  // Decrypt a single message in-place. Never shows raw ciphertext or error strings.
  const decryptOne = useCallback((msg) => {
    if (!msg.isEncrypted || !msg.nonce) return msg;

    // Check session cache first (covers own sent messages after reload).
    try {
      const cached = sessionStorage.getItem(`msg:${msg._id}`);
      if (cached) return { ...msg, content: cached };
    } catch {}

    if (!privateKeyRef.current) return null;

    const senderId = String(msg.sender._id);
    const senderPublicKey = pubKeyCache.current[senderId] || msg.sender?.publicKey;
    if (!senderPublicKey) return null;

    const plaintext = decryptMessage(msg.content, msg.nonce, senderPublicKey, privateKeyRef.current);
    if (plaintext !== null) {
      try { sessionStorage.setItem(`msg:${msg._id}`, plaintext); } catch {}
      return { ...msg, content: plaintext };
    }

    return null; // undecryptable — filter out entirely
  }, [privateKeyRef]);

  const fetchMessages = useCallback(async (conversationId, silent = false) => {
    if (typeof window === 'undefined') return;
    // Respect rate-limit backoff.
    if (Date.now() < pollBackoffUntilRef.current) return;
    try {
      const data = await apiClient.get(`/api/messages/${conversationId}`);

      // Pre-cache public keys for all senders we haven't seen yet (string IDs).
      const unknownSenderIds = [...new Set(
        data
          .filter(m => m.isEncrypted && !pubKeyCache.current[String(m.sender._id)])
          .map(m => String(m.sender._id))
      )];
      await Promise.all(unknownSenderIds.map(id => getRecipientPublicKey(id)));

      const decrypted = data.map(m => m.isEncrypted ? decryptOne(m) : m).filter(Boolean);

      if (silent && decrypted.length > 0) {
        const latestMessage = decrypted[decrypted.length - 1];
        if (lastMessageId && latestMessage._id !== lastMessageId && latestMessage.sender._id !== user._id) {
          addNotification(`New message from ${latestMessage.sender.username}`, 'message');
        }
        setLastMessageId(latestMessage._id);
      }
      setMessages(decrypted);
      if (!silent && decrypted.length > 0) setLastMessageId(decrypted[decrypted.length - 1]._id);
      if (!silent) markAsRead(conversationId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        // Back off for 60 s on rate-limit response.
        pollBackoffUntilRef.current = Date.now() + 60000;
        if (!silent) addNotification('Too many requests. Pausing for 60 seconds.', 'error');
      } else if (!silent) {
        addNotification('Error loading messages', 'error');
      }
    }
  }, [lastMessageId, user, getRecipientPublicKey, decryptOne]);

  useEffect(() => {
    if (!authLoading && !user) {
      if (router.pathname !== '/login') router.replace('/login');
    }
  }, [user, authLoading, router]);

  // Capture the target conversationId from the URL once on mount, then strip it
  // immediately so router state changes don't interfere with the selection logic.
  const pendingConvIdRef = useRef(
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('conversationId')
      : null
  );

  // Once conversations are loaded, open the pending conversation (from notification click).
  useEffect(() => {
    if (!user || conversations.length === 0 || !pendingConvIdRef.current) return;
    const conversationId = pendingConvIdRef.current;
    pendingConvIdRef.current = null; // consume it — only handle once

    const conversation = conversations.find(c => c._id === conversationId);
    if (conversation) {
      setSelectedConversation(conversation);
      setLastMessageId(null);
      fetchMessages(conversationId);
      markAsRead(conversationId);
      setMobileChatOpen(true);
    }
  }, [user, conversations, fetchMessages]);

  useEffect(() => {
    const handleRouteError = (err) => { if (err.message && err.message.includes('Invariant')) return; };
    router.events.on('routeChangeError', handleRouteError);
    return () => router.events.off('routeChangeError', handleRouteError);
  }, [router]);

  useEffect(() => {
    if (typeof window !== 'undefined' && user) fetchConversations();
  }, [user, fetchConversations]);

  // SSE for real-time message notifications with exponential backoff reconnect.
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;

    let es;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      try {
        es = new EventSource(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/stream`, { withCredentials: true });
        sseRef.current = es;

        es.onopen = () => {
          // Successful connection — reset backoff.
          sseBackoffRef.current = 2000;
        };

        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (typeof data.messages === 'number') {
              const conv = selectedConvRef.current;
              if (conv) {
                // Auto-read if conversation is currently open.
                fetchMessages(conv._id, true);
                markAsRead(conv._id);
              } else {
                // New message in a background conversation — clear read cache so dot reappears.
                setReadConversationIds(new Set());
              }
              fetchConversations(true);
            }
          } catch {}
        };

        es.onerror = () => {
          es.close();
          if (cancelled) return;
          // Exponential backoff: double each attempt, cap at 30 s.
          const delay = sseBackoffRef.current;
          sseBackoffRef.current = Math.min(sseBackoffRef.current * 2, 30000);
          sseTimerRef.current = setTimeout(() => {
            if (!cancelled) connect();
          }, delay);
        };
      } catch {}
    };

    connect();

    return () => {
      cancelled = true;
      if (sseTimerRef.current) clearTimeout(sseTimerRef.current);
      if (es) es.close();
    };
  }, [user, fetchMessages, fetchConversations]);

  // Fallback polling for messages (20s, SSE handles fast path).
  useEffect(() => {
    if (typeof window === 'undefined' || !user || !selectedConversation) return;
    const tick = () => {
      if (!document.hidden && Date.now() >= pollBackoffUntilRef.current) {
        fetchMessages(selectedConversation._id, true);
      }
    };
    pollingRef.current = setInterval(tick, 20000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [user, selectedConversation, fetchMessages]);

  // Fallback polling for conversations list (30s).
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;
    const tick = () => {
      if (!document.hidden && Date.now() >= pollBackoffUntilRef.current) {
        fetchConversations(true);
      }
    };
    convPollingRef.current = setInterval(tick, 30000);
    return () => clearInterval(convPollingRef.current);
  }, [user, fetchConversations]);

  // Scroll to bottom when messages change.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const markAsRead = async (conversationId) => {
    setReadConversationIds(prev => new Set([...prev, conversationId]));
    try { await apiClient.put(`/api/messages/${conversationId}/read`); } catch {}
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;
    const plaintext = newMessage.trim();
    try {
      if (!e2eeReady || !privateKeyRef.current) {
        addNotification('Encryption not ready. Please wait a moment and try again.', 'error');
        return;
      }

      const otherUser = getOtherUser(selectedConversation);
      const recipientPubKey = await getRecipientPublicKey(otherUser._id);
      if (!recipientPubKey) {
        addNotification('Recipient has not set up encryption yet. Ask them to log in again.', 'error');
        return;
      }

      const { ciphertext, nonce } = encryptMessage(plaintext, recipientPubKey, privateKeyRef.current);
      const payload = { content: ciphertext, messageType: 'text', nonce, isEncrypted: true };

      const message = await apiClient.post(`/api/messages/${selectedConversation._id}`, payload);
      // Cache plaintext in sessionStorage so sent messages survive page reloads.
      try { sessionStorage.setItem(`msg:${message._id}`, plaintext); } catch {}
      // Show plaintext locally — we know what we sent.
      setMessages(prev => [...prev, { ...message, content: plaintext }]);
      setNewMessage('');
      setLastMessageId(message._id);
      fetchConversations(true);
    } catch {
      addNotification('Error sending message', 'error');
    }
  };

  const searchUsersForChat = async (query) => {
    if (!query || query.length < 2) { setFoundUsers([]); return; }
    try {
      const data = await apiClient.get(`/api/messages/search/users?query=${encodeURIComponent(query)}`);
      setFoundUsers(data);
    } catch {
      addNotification('Error searching users', 'error');
    }
  };

  const startConversation = async (otherUserId) => {
    try {
      const conversation = await apiClient.get(`/api/messages/conversations/${otherUserId}`);
      setSelectedConversation(conversation);
      setLastMessageId(null);
      fetchMessages(conversation._id);
      fetchConversations();
      // Pre-warm the recipient's public key so first send is instant.
      getRecipientPublicKey(otherUserId);
      setShowUserSearch(false);
      setSearchUsers('');
      setFoundUsers([]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        addNotification(
          'This account is private. You need to follow them first to send messages.',
          'error'
        );
      } else {
        addNotification('Error creating conversation', 'error');
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const getOtherUser = (conversation) => conversation.participants.find(p => p._id !== user._id);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) setShowEmojiPicker(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const onEmojiClick = (emoji) => {
    setNewMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  // Compute read receipt: last message the other user has read.
  const getReadReceipt = () => {
    if (!selectedConversation || messages.length === 0) return null;
    const otherUser = getOtherUser(selectedConversation);
    if (!otherUser) return null;
    // Walk backwards to find the last message sent by me that the other user has read.
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.sender._id === user._id && msg.readBy?.some(r => r.user === otherUser._id || r.user?._id === otherUser._id)) {
        return { messageId: msg._id, readAt: msg.readBy.find(r => r.user === otherUser._id || r.user?._id === otherUser._id)?.readAt };
      }
    }
    return null;
  };

  // Determine whether a conversation has an unread last message.
  const isConversationUnread = (conversation) => {
    if (!conversation.lastMessage) return false;
    // Already open or already locally marked as read.
    if (selectedConversation?._id === conversation._id) return false;
    if (readConversationIds.has(conversation._id)) return false;
    const senderId = conversation.lastMessage.sender?._id ?? conversation.lastMessage.sender;
    // Only show dot for messages sent by the other person.
    return String(senderId) !== String(user._id);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  const readReceipt = getReadReceipt();

  return (
    <>
      <Head>
        <title>Messages — NumisRoma</title>
        <meta name="description" content="Direct messaging between collectors" />
      </Head>

      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map(notification => (
          <NotificationToast
            key={notification.id}
            message={notification.message}
            type={notification.type}
            onClose={() => removeNotification(notification.id)}
          />
        ))}
      </div>

      <div className="h-full w-full bg-canvas">
        <div className="flex h-full w-full">
          {/* Conversations Sidebar */}
          <div className={`flex flex-col shrink-0 bg-card border-r border-border w-full md:w-72 ${mobileChatOpen ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <h1 className="font-display font-semibold text-xl text-text-primary">Messages</h1>
                <button
                  onClick={() => setShowUserSearch(!showUserSearch)}
                  className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-150 ${showUserSearch ? 'bg-amber-bg text-amber' : 'bg-surface-alt text-text-secondary hover:bg-amber-bg hover:text-amber'}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </button>
              </div>

              {showUserSearch && (
                <div className="mt-3">
                  <input
                    type="text" placeholder="Search users…"
                    value={searchUsers}
                    onChange={e => { setSearchUsers(e.target.value); searchUsersForChat(e.target.value); }}
                    className="w-full px-3 py-2 font-sans text-sm bg-surface border border-border rounded outline-none focus:border-amber transition-colors duration-150 text-text-primary"
                  />
                  {foundUsers.length > 0 && (
                    <div className="mt-1.5 max-h-40 overflow-y-auto border border-border rounded-md bg-card">
                      {foundUsers.map(foundUser => (
                        <div
                          key={foundUser._id}
                          onClick={() => startConversation(foundUser._id)}
                          className="flex items-center gap-2.5 p-2.5 cursor-pointer transition-colors duration-100 hover:bg-surface-alt"
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-amber-bg overflow-hidden">
                            {foundUser.avatar ? (
                              <Image src={foundUser.avatar} alt={foundUser.username} width={32} height={32} className="rounded-full" />
                            ) : (
                              <span className="font-display font-semibold text-sm text-amber">{foundUser.username.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <div>
                            <p className="font-sans text-sm font-medium text-text-primary">{foundUser.username}</p>
                            {foundUser.fullName && <p className="font-sans text-xs text-text-muted">{foundUser.fullName}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber border-t-transparent mx-auto" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="font-sans text-sm text-text-muted">No conversations yet.</p>
                  <p className="font-sans text-xs mt-1 text-text-muted">Start a new conversation!</p>
                </div>
              ) : (
                conversations.map(conversation => {
                  const otherUser = getOtherUser(conversation);
                  const isSelected = selectedConversation?._id === conversation._id;
                  const hasUnread = isConversationUnread(conversation);
                  return (
                    <div
                      key={conversation._id}
                      onClick={() => {
                        setSelectedConversation(conversation);
                        setLastMessageId(null);
                        fetchMessages(conversation._id);
                        markAsRead(conversation._id);
                        setMobileChatOpen(true);
                        // Pre-warm recipient public key for fast first encrypt.
                        const other = getOtherUser(conversation);
                        if (other) getRecipientPublicKey(other._id);
                      }}
                      className={`flex items-center gap-3 p-3.5 cursor-pointer transition-colors duration-100 border-b border-border ${isSelected ? 'bg-amber-bg border-l-[3px] border-l-amber' : 'hover:bg-surface-alt border-l-[3px] border-l-transparent'}`}
                    >
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-amber-bg overflow-hidden">
                        {otherUser?.avatar ? (
                          <Image src={otherUser.avatar} alt={otherUser.username} width={40} height={40} className="rounded-full object-cover" />
                        ) : (
                          <span className="font-display font-semibold text-amber">{otherUser?.username?.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-sans text-sm font-medium truncate text-text-primary">
                          {otherUser?.fullName || otherUser?.username}
                        </p>
                        {conversation.lastMessage && !conversation.lastMessage.isEncrypted && (
                          <p className="font-sans text-xs truncate text-text-muted">
                            {conversation.lastMessage.isDeleted ? 'Message deleted' : conversation.lastMessage.content}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {conversation.lastActivity && (
                          <span className="font-sans text-xs text-text-muted">
                            {formatTime(conversation.lastActivity)}
                          </span>
                        )}
                        {hasUnread && (
                          <span className="w-2 h-2 rounded-full bg-amber inline-block" aria-label="Unread message" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Chat Area */}
          <div className={`flex-1 flex-col bg-canvas ${mobileChatOpen ? 'flex' : 'hidden md:flex'}`}>
            {selectedConversation ? (
              <>
                {/* Chat Header */}
                <div className="flex items-center gap-3 p-4 border-b border-border bg-card">
                  <button
                    onClick={() => setMobileChatOpen(false)}
                    className="md:hidden flex items-center justify-center w-8 h-8 rounded text-text-muted hover:text-text-primary transition-colors duration-150 shrink-0"
                    aria-label="Back to conversations"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <Link
                    href={`/profile?id=${getOtherUser(selectedConversation)?._id}`}
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-amber-bg overflow-hidden hover:opacity-80 transition-opacity duration-150"
                  >
                    {getOtherUser(selectedConversation)?.avatar ? (
                      <Image
                        src={getOtherUser(selectedConversation).avatar}
                        alt={getOtherUser(selectedConversation).username}
                        width={36} height={36} className="rounded-full object-cover"
                      />
                    ) : (
                      <span className="font-display font-semibold text-amber">
                        {getOtherUser(selectedConversation)?.username?.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </Link>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/profile?id=${getOtherUser(selectedConversation)?._id}`}
                        className="font-sans text-sm font-semibold text-text-primary hover:text-amber transition-colors duration-150"
                      >
                        {getOtherUser(selectedConversation)?.fullName || getOtherUser(selectedConversation)?.username}
                      </Link>
                      {e2eeReady && (
                        <span title="End-to-end encrypted">
                          <svg className="w-3.5 h-3.5 text-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <p className="font-sans text-xs text-text-muted">
                      @{getOtherUser(selectedConversation)?.username}
                    </p>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((message, idx) => {
                    const isOwn = message.sender._id === user._id;
                    const isLast = idx === messages.length - 1;
                    return (
                      <div key={message._id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div>
                          <div className={`max-w-[75%] sm:max-w-xs lg:max-w-md px-4 py-2 rounded-md ${isOwn ? 'bg-text-primary text-canvas' : 'bg-card border border-border text-text-primary'}`}>
                            <p className="font-sans text-sm">{message.content}</p>
                            <p className={`font-sans text-xs mt-1 ${isOwn ? 'text-[rgba(253,248,240,0.6)]' : 'text-text-muted'}`}>
                              {formatTime(message.createdAt)}
                            </p>
                          </div>
                          {/* Read receipt under the last own message the other user has read */}
                          {isOwn && isLast && readReceipt?.messageId === message._id && (
                            <p className="font-sans text-[10px] text-text-muted text-right mt-0.5">
                              Seen {readReceipt.readAt ? formatTime(readReceipt.readAt) : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input */}
                <div className="p-4 flex items-center gap-2 border-t border-border bg-card">
                  <div className="relative" ref={emojiPickerRef}>
                    <button
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className={`p-2 transition-colors duration-150 ${showEmojiPicker ? 'text-amber' : 'text-text-muted hover:text-amber'}`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                    {showEmojiPicker && (
                      <div className="absolute bottom-11 left-0 z-50 p-4 bg-card border border-border rounded-lg shadow-lg min-w-[300px]">
                        <div className="grid grid-cols-6 gap-2">
                          {COMMON_EMOJIS.map((emoji, index) => (
                            <button
                              key={index} onClick={() => onEmojiClick(emoji)}
                              className="w-10 h-10 flex items-center justify-center rounded text-2xl hover:bg-surface-alt transition-colors duration-100"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <input
                    ref={inputRef}
                    type="text" value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Write a message…"
                    className="flex-1 px-3.5 py-2 font-sans text-sm bg-surface border border-border rounded-md outline-none focus:border-amber transition-colors duration-150 text-text-primary"
                  />
                  <button
                    onClick={sendMessage} disabled={!newMessage.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 font-sans text-sm font-semibold rounded-md bg-amber text-[#fdf8f0] hover:bg-amber-hover transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Send
                    <svg className="w-4 h-4 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-14 h-14 mx-auto mb-4 flex items-center justify-center rounded-full bg-surface-alt">
                    <svg className="w-7 h-7 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="font-display font-semibold text-xl mb-1 text-text-primary">Select a conversation</p>
                  <p className="font-sans text-sm text-text-muted">Choose a conversation from the list or start a new one</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

Messages.getLayout = function getLayout(page) {
  return (
    <div className="h-screen w-screen flex flex-col bg-canvas">
      <Navbar />
      <main className="flex-1 overflow-hidden">
        {page}
      </main>
    </div>
  );
};

export default Messages;
