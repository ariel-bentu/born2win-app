export interface NotificationUpdatePayload {
    notificationOn?: boolean;
    tokenInfo: {
        token:string;
        isSafari: boolean;
        createdAt: string;
    }
}


export interface UpdateUserLoginPayload {
    volunteerID: string;
    otp: string;
}