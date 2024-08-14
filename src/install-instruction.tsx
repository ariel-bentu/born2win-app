import React, { useEffect, useState } from 'react';
import iosIcon from './media/ios-share.png'; // Add your ios icon in the assets folder
import { Button } from 'primereact/button';
import { ProgressBar } from 'primereact/progressbar';

let deferredInstallPrompt: any = undefined;
window.addEventListener('beforeinstallprompt', (e) => {
    deferredInstallPrompt = e;
});



const PWAInstructions: React.FC = () => {
    const isAndroid = /android/i.test(navigator.userAgent);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const [installComplete, setInstallComplete] = useState<boolean>(false);
    const [installInProgress, setInstallInProgress] = useState<boolean>(false);
    
    useEffect(() => {
        window.addEventListener('appinstalled', () => {
            console.log('PWA was installed successfully!');
            setInstallComplete(true);
        });
    }, []);

    if (installComplete) {
        return <h2>התקנה הושלמה - פתח את האפליקציה</h2>;
    }

    if (installInProgress) {
        return <div>
            <ProgressBar mode="indeterminate" style={{ height: '6px' }}></ProgressBar>;
            <div>התקנה בתהליך...</div>
        </div>
    }

    return (
        <div className="surface-card shadow-2 p-3 border-round" dir="rtl" style={{ maxWidth: '600px', margin: 'auto' }}>
            <h2>יש להוסיף את הדף למסך הבית</h2>
            <div style={{ textAlign: 'center' }}>
                {isAndroid && (
                    <div>
                        <Button label="התקנה למסך הבית" onClick={async () => {
                            if (deferredInstallPrompt !== null) {
                                deferredInstallPrompt.prompt();
                                const { outcome } = await deferredInstallPrompt.userChoice;
                                if (outcome === 'accepted') {
                                    deferredInstallPrompt = undefined;
                                    setInstallInProgress(true);
                                }
                            }
                        }} />
                    </div>
                )}
                {isIOS && (
                    <div>

                        <p>
                            <strong>הוראות:</strong>
                        </p>
                        <ol style={{ textAlign: 'right' }}>
                            <li>ודאו שפתחתם את האתר בדפדפן Safari.</li>
                            <li>לחצו על סמל השיתוף (ריבוע עם חץ כלפי מעלה). <img src={iosIcon} alt="iOS Icon" style={{ width: '100px', height: '100px' }} /></li>
                            <li>בחרו "הוספה למסך הבית".</li>
                        </ol>
                    </div>
                )}
                {!isAndroid && !isIOS && (
                    <div>
                        <p>
                            <strong>הוראות כלליות:</strong>
                        </p>
                        <ol style={{ textAlign: 'right' }}>
                            <li>פתחו את האתר בדפדפן התומך ב-PWA.</li>
                            <li>חפשו את האפשרות להוספת האתר למסך הבית בתפריט הדפדפן.</li>
                        </ol>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PWAInstructions;