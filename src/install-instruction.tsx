import React from 'react';
import androidIcon from './media/android-share.png'; // Add your android icon in the assets folder
import iosIcon from './media/ios-share.png'; // Add your ios icon in the assets folder

const PWAInstructions: React.FC = () => {
    const isAndroid = /android/i.test(navigator.userAgent);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

    return (
        <div className="surface-card shadow-2 p-3 border-round" dir="rtl" style={{ maxWidth: '600px', margin: 'auto' }}>
            <h2>יש להוסיף את הדף למסך הבית</h2>
            <div style={{ textAlign: 'center' }}>
                {isAndroid && (
                    <div>
                        <img src={androidIcon} alt="Android Icon" style={{ width: '100px', height: '100px' }} />
                        <p>
                            <strong>הוראות:</strong>
                        </p>
                        <ol style={{ textAlign: 'right' }}>
                            <li>פתחו את האתר בדפדפן Chrome.</li>
                            <li>לחצו על סמל התפריט (שלוש נקודות) בפינה הימנית העליונה.</li>
                            <li>בחרו "הוסף למסך הבית".</li>
                        </ol>
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
                            <li>בחרו "הוסף למסך הבית".</li>
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