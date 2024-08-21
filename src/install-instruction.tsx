import React, { useEffect, useState } from 'react';
import iosIcon from './media/ios-share.png'; // Add your ios icon in the assets folder
import { Button } from 'primereact/button';

import { InProgress } from './common-ui';
import { isAndroid, isIOS } from './App';


const PWAInstructions: React.FC = () => {
    const [installComplete, setInstallComplete] = useState<boolean>(false);
    const [installInProgress, setInstallInProgress] = useState<boolean>(false);
    const deferredInstallPrompt = (window as any).deferredInstallPrompt;

    useEffect(() => {
        const uninstall = () => {
            console.log('PWA was installed successfully!');
            setInstallComplete(true);
        };
        window.addEventListener('appinstalled', uninstall);
        return () => window.removeEventListener('appinstalled', uninstall);
    }, []);

    if (installComplete) {
        return <h2>התקנה הושלמה - פתח את האפליקציה</h2>;
    }

    if (installInProgress) {
        return <div>
            <InProgress />
            <div>התקנה בתהליך...</div>
        </div>
    }

    return (
        <div className="surface-card shadow-2 p-3 border-round" dir="rtl" style={{ maxWidth: '600px', margin: 'auto' }}>
            <h2>יש להוסיף את הדף למסך הבית</h2>
            <div style={{ textAlign: 'center' }}>
                {isAndroid && (
                    <div>
                        {deferredInstallPrompt ? <Button label="התקנה למסך הבית" onClick={async () => {
                            deferredInstallPrompt.prompt();
                            const { outcome } = await deferredInstallPrompt.userChoice;
                            if (outcome === 'accepted') {
                                setInstallInProgress(true);
                            }

                        }} /> :
                            <div>

                                <p>
                                    <strong>הוראות:</strong>
                                </p>
                                <ol style={{ textAlign: 'right' }}>
                                    <li>פתחו את תפריט הדפדפן:</li>
                                    <li><div className="flex flex-row"> <div className='ml-2'>לחיצה על</div> <Button unstyled icon="pi pi-ellipsis-v" className="three-dot-menu ml-2" /> <div>ובחירת "הוספה למסך הבית"</div></div> </li>
                                    <li><div className="flex flex-row">
                                        <div className='ml-2'>או איקון שלושה קווים אופקיים</div>
                                        <Button unstyled icon="pi pi-bars" className="three-dot-menu ml-2" />
                                        <div className='ml-2'>ובחירת "הוסף דף ל-"</div>
                                        <div className='ml-2'>ובחירת "דף הבית"</div></div></li>
                                    <li>בחרו "הוספה למסך הבית".</li>
                                </ol>
                            </div>
                        }
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