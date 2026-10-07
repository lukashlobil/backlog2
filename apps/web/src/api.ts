import { signOut } from 'firebase/auth';
import { firebaseAuth } from './firebase';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = await firebaseAuth();
  const user = auth?.currentUser;
  if (!auth || !user) throw new ApiError(401, 'Please sign in to continue.');
  const send = async (forceRefresh: boolean) => {
    const token = await user.getIdToken(forceRefresh);
    if (auth.currentUser?.uid !== user.uid) throw new ApiError(401, 'Your account changed. Please try again.');
    const response = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers, Authorization: `Bearer ${token}` },
    });
    if (auth.currentUser?.uid !== user.uid) throw new ApiError(401, 'Your account changed. Please try again.');
    return response;
  };
  let response = await send(false);
  if (response.status === 401) {
    try { response = await send(true); }
    catch (error) { if (auth.currentUser?.uid === user.uid) await signOut(auth); throw error; }
    if (response.status === 401 && auth.currentUser?.uid === user.uid) await signOut(auth);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.error ?? 'Something went wrong. Please try again.');
  }
  return response.json();
}
