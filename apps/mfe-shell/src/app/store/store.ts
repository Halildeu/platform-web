import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/model/auth.slice';
import counterReducer from '../../features/counter/model/counter.slice';
import productsReducer from '../../features/products/model/products.slice';
import notificationsReducer from '../../features/notifications/model/notifications.slice';
import { notifyInboxApi } from '../../features/notifications/api/notify-inbox.api';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    counter: counterReducer,
    products: productsReducer,
    notifications: notificationsReducer,
    // Faz 23.4 PR-E.5: notification-orchestrator inbox REST cache
    // (createApi reducer; tags drive invalidation on mark-read / archive).
    [notifyInboxApi.reducerPath]: notifyInboxApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(notifyInboxApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
