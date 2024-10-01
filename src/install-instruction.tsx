import React, { useEffect, useState } from 'react';
import shareIos from './media/shareIos.png'; // Add your ios icon in the assets folder
import chrome from './media/chrome.png'; // Add your ios icon in the assets folder
import safariIcon from './media/safari.png'; // Add your ios icon in the assets folder
import { Button } from 'primereact/button';

import { InProgress } from './common-ui';
import { isAndroid, isIOS } from './App';
import { Divider } from 'primereact/divider';


const PWAInstructions: React.FC = () => {
    const [installComplete, setInstallComplete] = useState<boolean>(false);
    const [installInProgress, setInstallInProgress] = useState<boolean>(false);
    const deferredInstallPrompt: any = (window as any).deferredInstallPrompt;

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
        <div className="w-full" dir="rtl">
            <div style={{
                display: "flex", flexDirection: "column",
                background: "var(--born2win-button-green)", color: "white",
                fontSize: 20,
                fontWeight: "bold",
                height: 150, justifyContent: "center"
            }}>
                <div>בואו נתחיל...</div>
                <div>הנה הנחיות להתקנת האפליקציה: </div>
            </div>
            <div style={{ textAlign: 'center' }}>
                {isAndroid && (
                    <div className='w-full justify-content-start m-4 text-xl' >
                        <div className='flex flex-row align-items-center'>
                            <div className='ml-2'>1. יש לוודא שהלינק נפתח בדפדפן Chrome</div>
                            <img src={chrome} height={50} width={50}></img>
                        </div>
                        <Divider />
                        {deferredInstallPrompt ? <div className='flex flex-column align-items-start'>
                            <div className='ml-2'>2. לחצו על כפתור התקנה למסך הבית </div>
                            <Button label="התקנה למסך הבית" onClick={async () => {
                                deferredInstallPrompt.prompt();
                                const { outcome } = await deferredInstallPrompt.userChoice;
                                if (outcome === 'accepted') {
                                    setInstallInProgress(true);
                                }

                            }} />
                        </div> :
                            <div>
                                <div className='flex flex-column align-items-start'>
                                    <div className='ml-2'>2. פתחו את תפריט הדפדפן (שלוש נקודות)  </div>
                                    <Button unstyled icon="pi pi-ellipsis-v" className='mr-3' style={{ background: "lightgray", border: "none", borderRadius: "50%", height: 40, width: 40 }} />
                                </div>
                                <Divider />
                                <div className='flex flex-column align-items-start'>
                                    <div className='text-right'>3. בחרו 'הוספה למסך הבית'</div>
                                </div>
                                <Divider />
                                <div className='flex flex-column align-items-start'>
                                    <div className='text-right'>{deferredInstallPrompt ? "3" : "4"}. אתרו את האפליקציה במסך הבית <br /> או ברשימת האפליקציות המותקנות ופתחו אותה</div>
                                </div>
                            </div>
                        }
                        <Divider />
                        <div className='flex flex-column align-items-center '>
                            <a className='ml-2 text-right' href="https://youtu.be/MAh_0Hb4mCg?si=pjzpvchbaw1S8QOh">סרטון הסבר</a>
                        </div>

                    </div>
                )}
                {isIOS && (
                    <div className='w-full justify-content-start m-4 text-xl' >

                        <div className='flex flex-column align-items-start '>
                            <div className='ml-2 text-right'>1. לחצו על סמל השיתוף (בתחתית המסך של האייפון) </div>
                            <img src={shareIos} height={60} ></img>
                        </div>
                        <Divider />
                        <div className='flex flex-column align-items-start'>
                            <div className='ml-2'>2.  בחרו מהתפריט 'הוספה למסך הבית' או<br /> 'Add to Home Screen' </div>
                        </div>
                        <Divider />
                        <div className='flex flex-column align-items-start'>
                            <div className='ml-2'>3. פתחו את האפליקציה</div>
                        </div>
                        <Divider />
                        <div className='flex flex-column align-items-center '>
                            <a className='ml-2 text-right' href="https://youtu.be/YIQM30EJBYg?si=x2KbGWZmkWtEcrxh">סרטון הסבר</a>
                        </div>

                    </div>
                )}
                {!isAndroid && !isIOS && (
                    <div className='w-full justify-content-start m-4 text-xl' >
                        <div className='flex flex-row align-items-center'>
                            <div className='ml-2'>יש לפתוח את הלינק בדפדפן Chrome</div>
                            <img src={chrome} height={50} width={50}></img>
                        </div>
                        <Divider />
                        <div className='flex flex-column align-items-start'>
                            <div className='ml-2'>דפדפן זה אינו נתמך</div>
                        </div>
                        <Divider />
                    </div>
                )}
            </div>
        </div>
    );
};

export default PWAInstructions;