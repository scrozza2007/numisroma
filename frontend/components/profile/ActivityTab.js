import React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';

const ActivityTab = ({ activities, loadingActivities, user, profile }) => {
  const router = useRouter();

  return (
    <div className="mt-8 pb-16">
      <h2 className="font-display font-semibold text-2xl mb-6 text-text-primary">Recent Activities</h2>

      {loadingActivities ? (
        <div className="p-10 text-center bg-card border border-border rounded-lg">
          <div className="animate-spin rounded-full h-7 w-7 border-2 border-amber border-t-transparent mx-auto mb-2" />
          <p className="font-sans text-sm text-text-muted">Loading activities…</p>
        </div>
      ) : activities.length > 0 ? (
        <div className="space-y-3">
          {activities.map((activity, index) => (
            <div key={index} className="p-4 bg-card border border-border rounded-lg">
              <div className="flex items-start gap-3">
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-bg">
                    {activity.user.avatar ? (
                      <Image src={activity.user.avatar} alt={activity.user.username} width={40} height={40} className="rounded-full" />
                    ) : (
                      <span className="font-display font-semibold text-lg text-amber">
                        {activity.user.username.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center bg-amber">
                    {activity.type === 'collection_created' ? (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {activity.type === 'collection_created' ? (
                        <>
                          <p className="font-sans text-sm text-text-primary">
                            <span
                              className="font-medium cursor-pointer text-amber hover:text-amber-hover transition-colors duration-150"
                              onClick={() => router.push(`/profile?id=${activity.user._id}`)}
                            >
                              {activity.user.username}
                            </span>{' '}
                            created a new collection{' '}
                            <span
                              className="font-semibold cursor-pointer text-amber hover:text-amber-hover transition-colors duration-150"
                              onClick={() => router.push(`/collection-detail?id=${activity.collection._id}`)}
                            >
                              &quot;{activity.collection.name}&quot;
                            </span>
                          </p>
                          <div className="flex items-center gap-3 mt-1 font-sans text-xs text-text-muted">
                            <span>{activity.collection.coins?.length || 0} coins</span>
                            <span>·</span>
                            <span>{activity.collection.isPublic ? 'Public' : 'Private'}</span>
                          </div>
                        </>
                      ) : (
                        <p className="font-sans text-sm text-text-primary">
                          <span
                            className="font-medium cursor-pointer text-amber hover:text-amber-hover transition-colors duration-150"
                            onClick={() => router.push(`/profile?id=${activity.user._id}`)}
                          >
                            {activity.user.username}
                          </span>{' '}
                          started following{' '}
                          {user && user._id === profile._id ? 'you' : profile.username}
                        </p>
                      )}
                      <p className="font-sans text-xs mt-1 text-text-muted">
                        {new Date(activity.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    <button
                      onClick={() => router.push(
                        activity.type === 'collection_created'
                          ? `/collection-detail?id=${activity.collection._id}`
                          : `/profile?id=${activity.user._id}`
                      )}
                      className="shrink-0 flex items-center gap-1 px-3 py-1.5 font-sans text-xs font-semibold bg-amber-bg text-amber border border-amber-light rounded-md transition-colors duration-150 hover:bg-amber hover:text-[#fdf8f0]"
                    >
                      {activity.type === 'collection_created' ? 'View' : 'View Profile'}
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-12 text-center bg-card border border-border rounded-lg">
          <div className="w-14 h-14 mx-auto mb-4 flex items-center justify-center rounded-full bg-amber-bg">
            <svg className="w-7 h-7 text-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-display font-semibold text-xl mb-2 text-text-primary">No Recent Activity</h3>
          <p className="font-sans text-sm max-w-md mx-auto text-text-muted">
            {user && user._id === profile._id
              ? 'Create your first collection or start following other collectors to see activities here!'
              : 'No recent activities to show for this user.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default ActivityTab;
