import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Image from 'next/image';
import NotificationToast from '../components/NotificationToast';
import Navbar from '../components/Navbar';
import { apiClient } from '../utils/apiClient';

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
  const pollingRef = useRef(null);
  const convPollingRef = useRef(null);
  const sseRef = useRef(null);
  const { user, isLoading: authLoading } = useContext(AuthContext);
  const router = useRouter();
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
    try {
      if (!silent) setLoading(true);
      const data = await apiClient.get('/api/messages/conversations');
      setConversations(Array.isArray(data) ? data : data.conversations || []);
    } catch {
      if (!silent) addNotification('Error loading conversations', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (conversationId, silent = false) => {
    if (typeof window === 'undefined') return;
    try {
      const data = await apiClient.get(`/api/messages/${conversationId}`);
      if (silent && data.length > 0) {
        const latestMessage = data[data.length - 1];
        if (lastMessageId && latestMessage._id !== lastMessageId && latestMessage.sender._id !== user._id) {
          addNotification(`New message from ${latestMessage.sender.username}`, 'message');
        }
        setLastMessageId(latestMessage._id);
      }
      setMessages(data);
      if (!silent && data.length > 0) setLastMessageId(data[data.length - 1]._id);
      if (!silent) markAsRead(conversationId);
    } catch {
      if (!silent) addNotification('Error loading messages', 'error');
    }
  }, [lastMessageId, user]);

  useEffect(() => {
    if (!authLoading && !user) {
      if (router.pathname !== '/login') router.replace('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (typeof window !== 'undefined' && user && router.query.conversationId) {
      const conversationId = router.query.conversationId;
      const conversation = conversations.find(c => c._id === conversationId);
      if (conversation) { setSelectedConversation(conversation); fetchMessages(conversationId); }
    }
  }, [user, router.query.conversationId, conversations, fetchMessages]);

  useEffect(() => {
    const handleRouteError = (err) => { if (err.message && err.message.includes('Invariant')) return; };
    router.events.on('routeChangeError', handleRouteError);
    return () => router.events.off('routeChangeError', handleRouteError);
  }, [router]);

  useEffect(() => {
    if (typeof window !== 'undefined' && user) fetchConversations();
  }, [user, fetchConversations]);

  // SSE for real-time message notifications.
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;

    let es;
    const connect = () => {
      try {
        es = new EventSource('/api/notifications/stream', { withCredentials: true });
        sseRef.current = es;
        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            // If messages count changed, refresh the current conversation immediately.
            if (typeof data.messages === 'number') {
              const conv = selectedConvRef.current;
              if (conv) fetchMessages(conv._id, true);
              fetchConversations(true);
            }
          } catch {}
        };
        es.onerror = () => { es.close(); };
      } catch {}
    };

    connect();
    return () => { if (es) es.close(); };
  }, [user, fetchMessages, fetchConversations]);

  // Fallback polling for messages (20s, SSE handles fast path).
  useEffect(() => {
    if (typeof window === 'undefined' || !user || !selectedConversation) return;
    const tick = () => { if (!document.hidden) fetchMessages(selectedConversation._id, true); };
    pollingRef.current = setInterval(tick, 20000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [user, selectedConversation, fetchMessages]);

  // Fallback polling for conversations list (30s).
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;
    const tick = () => { if (!document.hidden) fetchConversations(true); };
    convPollingRef.current = setInterval(tick, 30000);
    return () => clearInterval(convPollingRef.current);
  }, [user, fetchConversations]);

  // Scroll to bottom when messages change.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const markAsRead = async (conversationId) => {
    try { await apiClient.put(`/api/messages/${conversationId}/read`); } catch {}
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;
    try {
      const message = await apiClient.post(`/api/messages/${selectedConversation._id}`, { content: newMessage.trim(), messageType: 'text' });
      setMessages(prev => [...prev, message]);
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
      setShowUserSearch(false);
      setSearchUsers('');
      setFoundUsers([]);
    } catch {
      addNotification('Error creating conversation', 'error');
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
                  return (
                    <div
                      key={conversation._id}
                      onClick={() => {
                        setSelectedConversation(conversation);
                        setLastMessageId(null);
                        fetchMessages(conversation._id);
                        markAsRead(conversation._id);
                        setMobileChatOpen(true);
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
                        {conversation.lastMessage && (
                          <p className="font-sans text-xs truncate text-text-muted">
                            {conversation.lastMessage.isDeleted ? 'Message deleted' : conversation.lastMessage.content}
                          </p>
                        )}
                      </div>
                      {conversation.lastActivity && (
                        <span className="font-sans text-xs shrink-0 text-text-muted">
                          {formatTime(conversation.lastActivity)}
                        </span>
                      )}
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
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-amber-bg overflow-hidden">
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
                  </div>
                  <div>
                    <p className="font-sans text-sm font-semibold text-text-primary">
                      {getOtherUser(selectedConversation)?.fullName || getOtherUser(selectedConversation)?.username}
                    </p>
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
