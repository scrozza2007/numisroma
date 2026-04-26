import React, { useEffect, useState, useContext } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { AuthContext } from '../context/AuthContext';
import { apiClient } from '../utils/apiClient';
import ProfileHeader from '../components/profile/ProfileHeader';
import CollectionsTab from '../components/profile/CollectionsTab';
import ActivityTab from '../components/profile/ActivityTab';
import FollowModal from '../components/profile/FollowModal';
import { semantic } from '../utils/tokens';

const ProfilePage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useContext(AuthContext);

  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [activeTab, setActiveTab] = useState('collections');
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioText, setBioText] = useState('');
  const [bioLoading, setBioLoading] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [loadingFollowers, setLoadingFollowers] = useState(false);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [activities, setActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  useEffect(() => {
    document.body.style.overflow = (showFollowersModal || showFollowingModal) ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [showFollowersModal, showFollowingModal]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login?message=You must be logged in to access community features');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user && !id) router.replace(`/profile?id=${user._id}`);
  }, [authLoading, user, id, router]);

  useEffect(() => {
    const { message, type } = router.query;
    if (!message || !type) return;
    setNotification({ show: true, message: decodeURIComponent(message), type });
    setTimeout(() => {
      const q = { ...router.query };
      delete q.message; delete q.type;
      router.replace({ pathname: router.pathname, query: q }, undefined, { shallow: true });
    }, 100);
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 3000);
  }, [router.query, router]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setProfileError(null);
    apiClient.get(`/api/users/${id}/profile`)
      .then(data => { setProfile(data); setBioText(data.bio || ''); })
      .catch(err => {
        const isOwnProfile = user && (user._id === id || user.id === id);
        if (err?.status === 401 || isOwnProfile) {
          router.push('/login?message=Your session has expired. Please log in again.');
        } else if (err?.status === 404) {
          setProfileError('not_found');
        } else {
          setProfileError('error');
        }
        setProfile(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    apiClient.get(`/api/collections/user/${id}`)
      .then(data => setCollections(data?.collections ?? data))
      .catch(err => { if (err?.status !== 401) setCollections([]); });
  }, [id]);

  useEffect(() => {
    if (!id || !profile) return;
    setLoadingActivities(true);
    apiClient.get(`/api/users/${id}/activity`)
      .then(data => {
        const collectionActivities = collections.map(c => ({
          type: 'collection_created', user: profile, collection: c, createdAt: c.createdAt,
        }));
        setActivities([...data, ...collectionActivities].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      })
      .catch(() => setActivities([]))
      .finally(() => setLoadingActivities(false));
  }, [id, collections, profile]);

  const notify = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 3000);
  };

  const loadFollowers = async () => {
    setLoadingFollowers(true);
    try { setFollowers(await apiClient.get(`/api/users/${id}/followers`)); }
    catch (err) { notify(err.message || 'Error loading followers', 'error'); }
    finally { setLoadingFollowers(false); }
  };

  const loadFollowing = async () => {
    setLoadingFollowing(true);
    try { setFollowing(await apiClient.get(`/api/users/${id}/following`)); }
    catch (err) { notify(err.message || 'Error loading following', 'error'); }
    finally { setLoadingFollowing(false); }
  };

  const handleOpenChat = async () => {
    if (!user) { router.push('/login'); return; }
    setChatLoading(true);
    try {
      const data = await apiClient.get(`/api/messages/conversations/${id}`);
      router.push(`/messages?conversationId=${data._id}`);
    } catch {
      notify('Error creating chat. Please try again.', 'error');
    } finally {
      setChatLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!user) { router.push('/login'); return; }
    setFollowLoading(true);
    try {
      if (profile.isFollowing) {
        await apiClient.delete(`/api/users/${id}/unfollow`);
        setActivities(prev => prev.filter(a => a.user._id !== user._id));
      } else {
        await apiClient.post(`/api/users/${id}/follow`);
        setActivities(prev => [{ type: 'follow', user: { _id: user._id, username: user.username, avatar: user.avatar }, createdAt: new Date().toISOString() }, ...prev]);
      }
      setProfile(p => ({ ...p, isFollowing: !p.isFollowing }));
      notify(profile.isFollowing ? 'You have stopped following this user' : 'You have started following this user');
    } catch {
      notify('Error. Please try again.', 'error');
    } finally {
      setFollowLoading(false);
    }
  };

  const saveBio = async () => {
    if (!user || user._id !== profile._id) return;
    setBioLoading(true);
    try {
      await apiClient.post('/api/auth/update-profile', { bio: bioText });
      setProfile(p => ({ ...p, bio: bioText }));
      setIsEditingBio(false);
      notify('Biography updated successfully');
    } catch {
      notify('Error updating biography. Please try again.', 'error');
    } finally {
      setBioLoading(false);
    }
  };

  const cancelBioEdit = () => { setBioText(profile.bio || ''); setIsEditingBio(false); };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  if (!profile) {
    const isError = profileError === 'error';
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-canvas">
        <p className="font-display font-semibold text-2xl mb-2 text-text-primary">
          {isError ? 'Something went wrong' : 'Profile not found'}
        </p>
        <p className="font-sans text-sm mb-6 text-text-muted">
          {isError ? 'Could not load this profile. Please try again.' : "This user profile doesn't exist or may have been removed."}
        </p>
        <div className="flex gap-3">
          {isError && (
            <button
              onClick={() => router.reload()}
              className="px-5 py-2.5 font-sans text-sm font-semibold rounded-md bg-amber text-[#fdf8f0] hover:bg-amber-hover transition-colors duration-150"
            >
              Try again
            </button>
          )}
          <Link
            href="/"
            className="px-5 py-2.5 font-sans text-sm border border-border rounded-md bg-card text-text-secondary hover:border-border-strong transition-colors duration-150"
          >
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  const isOwnProfile = user._id === profile._id;

  return (
    <div className="min-h-screen bg-canvas">
      <Head>
        <title>{profile.username} — NumisRoma Profile</title>
        <meta name="description" content={`Profile page of ${profile.username} on NumisRoma`} />
      </Head>

      {notification.show && (
        <div
          className="fixed top-6 right-6 z-50 p-3.5 flex items-start gap-2 font-sans text-sm rounded-md max-w-xs"
          style={{
            backgroundColor: notification.type === 'success' ? semantic.success.bg : semantic.error.bg,
            border: `1px solid ${notification.type === 'success' ? semantic.success.border : semantic.error.border}`,
            color: notification.type === 'success' ? semantic.success.text : semantic.error.text,
          }}
        >
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={notification.type === 'success' ? 'M5 13l4 4L19 7' : 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'} />
          </svg>
          {notification.message}
        </div>
      )}

      {/* Banner */}
      <div className="w-full h-48 md:h-64 bg-surface-alt" />

      <div className="max-w-5xl mx-auto px-4 relative">
        <ProfileHeader
          profile={profile}
          collectionsCount={collections.length}
          isOwnProfile={isOwnProfile}
          user={user}
          followLoading={followLoading}
          chatLoading={chatLoading}
          isEditingBio={isEditingBio}
          bioText={bioText}
          bioLoading={bioLoading}
          activeTab={activeTab}
          onFollow={handleFollow}
          onChat={handleOpenChat}
          onSetActiveTab={setActiveTab}
          onEditBioStart={() => setIsEditingBio(true)}
          onBioChange={setBioText}
          onBioSave={saveBio}
          onBioCancelEdit={cancelBioEdit}
          onShowFollowers={() => { setShowFollowersModal(true); loadFollowers(); }}
          onShowFollowing={() => { setShowFollowingModal(true); loadFollowing(); }}
        />

        {activeTab === 'collections' && (
          <CollectionsTab collections={collections} profile={profile} isOwnProfile={isOwnProfile} />
        )}
        {activeTab === 'activity' && (
          <ActivityTab activities={activities} loadingActivities={loadingActivities} user={user} profile={profile} />
        )}
      </div>

      <FollowModal
        title="Followers"
        isOpen={showFollowersModal}
        onClose={() => setShowFollowersModal(false)}
        users={followers}
        loading={loadingFollowers}
        onNavigate={uid => router.push(`/profile?id=${uid}`)}
      />
      <FollowModal
        title="Following"
        isOpen={showFollowingModal}
        onClose={() => setShowFollowingModal(false)}
        users={following}
        loading={loadingFollowing}
        onNavigate={uid => router.push(`/profile?id=${uid}`)}
      />
    </div>
  );
};

export default ProfilePage;
