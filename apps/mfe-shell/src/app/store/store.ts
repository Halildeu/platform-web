import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/model/auth.slice';
import counterReducer from '../../features/counter/model/counter.slice';
import productsReducer from '../../features/products/model/products.slice';
import notificationsReducer from '../../features/notifications/model/notifications.slice';
import { notifyInboxApi } from '../../features/notifications/api/notify-inbox.api';
import { notifyPrefsApi } from '../../features/notifications/api/notify-prefs.api';
import { notifyUnsubscribeApi } from '../../features/notifications/api/notify-unsubscribe.api';
import { notifyTopicCatalogApi } from '../../features/notifications/api/notify-topic-catalog.api';

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
    // Faz 23.5 M5 G3: public unsubscribe landing — HMAC-token-based,
    // no JWT/identity headers (decoupled from preference editor surface).
    [notifyUnsubscribeApi.reducerPath]: notifyUnsubscribeApi.reducer,
    // Faz 23.5 M5 G3b: topic catalog (powers preference form autocomplete +
    // critical-eligible badge + channel multi-select restriction).
    [notifyTopicCatalogApi.reducerPath]: notifyTopicCatalogApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      notifyInboxApi.middleware,
      notifyPrefsApi.middleware,
      notifyUnsubscribeApi.middleware,
      notifyTopicCatalogApi.middleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
