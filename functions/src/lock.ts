import { DocumentReference, Firestore } from "firebase-admin/firestore";
import { Collections } from "../../src/types";

export class Lock {
    public lockId: string;
    private docRef: DocumentReference<any>;
    private constructor(lockId: string, docRef: DocumentReference<any>) {
        this.lockId = lockId;
        this.docRef = docRef;
    }
    static async acquire(db: Firestore, lockId: string, { lockDurationMs = 1000 * 60 } = {}): Promise<Lock | undefined> {
        const docRef = db.collection(Collections.Locks).doc(lockId);
        const maybeLock = await db.runTransaction(async transaction => {
            const doc = await transaction.get(docRef);
            const expiration = doc.data()?.expiration || 0;
            if (expiration > Date.now()) {
                // Someone else has the lock
                return;
            }
            const newExpiration = Date.now() + lockDurationMs;
            transaction.set(docRef, { expiration: newExpiration }, { merge: true });

            const lock = new Lock(lockId, docRef);
            return lock;
        });
        return maybeLock;
    }

    async release() {
        return this.docRef.delete();
    }
}