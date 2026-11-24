// Public Firebase settings shared by Meu Painel and Meu Financeiro.
// These identify the project; they are not secrets. Access is protected by firestore.rules.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCjXZbZTQhKS9atYSINtCDpTd4a_kRE3SU",
  authDomain: "meu-paniel.firebaseapp.com",
  projectId: "meu-paniel",
  storageBucket: "meu-paniel.firebasestorage.app",
  messagingSenderId: "296050221551",
  appId: "1:296050221551:web:83efcb462b068bc18f161a"
};
// The owner manages who has access (config/access). The same rule is enforced by firestore.rules.
export const OWNER_EMAIL = "luizotaviomoreira30@gmail.com";

// Whether this Google account may use the apps: the owner always; anyone else only while on the owner's list.
// Reading the list is itself protected, so an account outside it gets "permission denied" here.
export async function checkAccess(fdb, user) {
  const email = String((user && user.email) || "").toLowerCase();
  if (!user || !user.emailVerified) return { ok: false, reason: "unverified" };
  if (email === OWNER_EMAIL) return { ok: true, owner: true };
  try {
    const snap = await fdb.doc("config/access").get();
    const list = (snap.exists && Array.isArray(snap.data().emails)) ? snap.data().emails : [];
    return list.includes(email) ? { ok: true, owner: false } : { ok: false, reason: "not_listed" };
  } catch (e) {
    const code = String((e && e.code) || "");
    return { ok: false, reason: /permission/.test(code) ? "not_listed" : "offline" };
  }
}
export function accessMessage(user, reason) {
  if (reason === "offline") return ["Não foi possível confirmar o seu acesso.", "Verifique a conexão com a internet e recarregue a página."];
  if (reason === "unverified") return ["Esta conta do Google ainda não tem o e-mail verificado.", "Entre com outra conta."];
  return ["A conta " + ((user && user.email) || "escolhida") + " ainda não foi liberada.", "Peça a quem administra o painel para liberar este e-mail em Evolução → Pessoas com acesso. Depois, recarregue a página."];
}
