import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/model/auth.slice';
import counterReducer from '../../features/counter/model/counter.slice';
import productsReducer from '../../features/products/model/products.slice';
import notificationsReducer from '../../features/notifications/model/notifications.slice';
import { notifyInboxApi } from '../../features/notifications/api/notify-inbox.api';
import { notifyPrefsApi } from '../../features/notifications/api/notify-prefs.api';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    counter: counterReducer,
    products: productsReducer,
    notifications: notificationsReducer,
    // Faz 23.4 PR-E.5: notification-orchestrator inbox REST cache
    // (createApi reducer; tags drive invalidation on mark-read / archive).
    [notifyInboxApi.reducerPath]: notifyInboxApi.reducer,
    // Faz 23.5 PR3: notification-orchestrator preference REST cache.
    [notifyPrefsApi.reducerPath]: notifyPrefsApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(notifyInboxApi.middleware, notifyPrefsApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
