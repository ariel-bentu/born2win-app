import React, { useCallback, useEffect, useState } from 'react';
import { getStorage, ref, listAll, getDownloadURL, deleteObject, uploadBytes, getMetadata, updateMetadata } from 'firebase/storage';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { FileUpload } from 'primereact/fileupload';
import { AppServices, UserInfo } from './types';
import { SelectButton } from 'primereact/selectbutton';
import { InputText } from 'primereact/inputtext';
import { InProgress } from './common-ui';
import { confirmPopup } from 'primereact/confirmpopup';
import { Carousel } from 'primereact/carousel';
import './gallery.css';
import { analyticLog } from './api';


interface GalleryProps {
    userInfo: UserInfo | null;
    storagePath: string;
    appServices: AppServices;
    topPosition:number;
}

interface ImageItem {
    name: string;
    displayName: string;
    url: string;
}

interface Folder {
    name: string;
    items: ImageItem[];
    loaded: boolean;
}

export const Gallery: React.FC<GalleryProps> = ({ storagePath, userInfo, appServices, topPosition }) => {
    const storage = getStorage();
    const [folders, setFolders] = useState<Folder[]>([]);
    const [currentFolder, setCurrentFolder] = useState<string | null>(null);
    const [newFolderName, setNewFolderName] = useState<string>('');
    const [newFileName, setNewFileName] = useState<string | undefined>();
    const [busy, setBusy] = useState<boolean>(false);
    const [reload, setReload] = useState<number>(0);
    const [activeIndex, setActiveIndex] = useState<number>(0);
    const [folderInputVisible, setFolderInputVisible] = useState<boolean>(false);
    const [uploadDialogVisible, setUploadDialogVisible] = useState<boolean>(false);
    const [fileFolderEditVisible, setFileFolderEditVisible] = useState<boolean>(false);

    const itemTemplate = useCallback((item: ImageItem) => {
        console.log("render item", item.name)
        if (!item) return null;
        return <div>
            <div className='absolute w-12 text-center  text-black text-2xl font-bold p-3' style={{ backgroundColor: "rgba(255,255,255,0.3)" }}>{item.displayName}</div>
            <img src={item.url} alt={item.displayName} style={{ width: '100%', display: 'block' }} />
        </div>;
    },[]);


    useEffect(() => {
        analyticLog("Gallery", "open");
        const loadFolders = async () => {
            const path = `${storagePath}`;
            const rootRef = ref(storage, path);
            setBusy(true);
            const { prefixes } = await listAll(rootRef);
            const initialFolders: Folder[] = prefixes.map((prefix) => ({
                name: prefix.name,
                items: [],
                loaded: false, // Initially set to false (not loaded)
            }));
            setFolders(initialFolders);
            if (initialFolders.length > 0) {
                handleFolderClick(initialFolders, initialFolders[0].name);
            }
            setBusy(false);
        };

        loadFolders();
    }, [reload]);

    // Function to load the folder's content lazily
    const handleFolderClick = async (_folders: Folder[], folderName: string) => {
        console.log("folder clicked ", folderName)
        analyticLog("Gallery", "select folder " + folderName);
        const folderIndex = _folders.findIndex(f => f.name === folderName);
        if (folderIndex < 0) return;
        const selectedFolder = _folders[folderIndex];

        if (selectedFolder.loaded) {
            setCurrentFolder(selectedFolder.name);
            setActiveIndex(0);
            return;
        }
        console.log("Reload folder", folderName)
        const folderRef = ref(storage, `${storagePath}/${folderName}`);
        setBusy(true);
        const results = await listAll(folderRef);

        const items = results.items.filter(item => item.name !== "placeholder.txt");
        const loadedItems = await Promise.all(
            items.map(async (fileRef) => {
                const [url, metadata] = await Promise.all([
                    getDownloadURL(fileRef),
                    getMetadata(fileRef)
                ]);
                const displayName = metadata.customMetadata?.displayName !== undefined ? metadata.customMetadata.displayName : getFileNameWithoutExtension(fileRef.name);
                return { name: fileRef.name, displayName, url };
            })
        );
        const updatedFolders = [..._folders];
        updatedFolders[folderIndex] = {
            ...selectedFolder,
            items: loadedItems,
            loaded: true,
        };
        setFolders(updatedFolders);
        setCurrentFolder(selectedFolder.name);
        setActiveIndex(0);
        setBusy(false);
    };

    const handleDeleteImage = useCallback((index: number) => {
        if (!currentFolder) return;
        const folderObj = folders.find(f => f.name === currentFolder)
        if (!folderObj) return;
        confirmPopup({
            message: `האם למחוק תמונה -  ${folderObj.items[index].name}?`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: "כן",
            rejectLabel: "לא",
            accept: async () => {
                const imageRef = ref(storage, `${storagePath}/${currentFolder}/${folderObj.items[index].name}`);
                await deleteObject(imageRef);
                appServices.showMessage('success', ',תמונה נמחקה בהצלחה', '')
                setActiveIndex(0);
                setReload(prev => prev + 1)
            }
        });
    }, [folders, currentFolder, appServices, storagePath])

    const deleteFolder = async (folderPath: string) => {
        const folderRef = ref(storage, folderPath);

        try {
            // List all the items (files) in the folder
            const listResults = await listAll(folderRef);

            // Delete each file in the folder
            const deletePromises = listResults.items.map((fileRef) => deleteObject(fileRef));
            await Promise.all(deletePromises);

            console.log("Folder contents deleted successfully");
        } catch (error) {
            console.error("Error deleting folder contents: ", error);
        }
    };

    const handleDeleteFolder = useCallback(() => {
        if (!currentFolder) return;
        const folderObj = folders.find(f => f.name === currentFolder)
        if (!folderObj) return;
        confirmPopup({
            message: `האם למחוק תיקיה '${folderObj.name}' וכל התמונות שבתוכה?`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: "כן",
            rejectLabel: "לא",
            accept: async () => {
                await deleteFolder(`${storagePath}/${currentFolder}`);
                appServices.showMessage('success', 'תיקיה נמחקה בהצלחה', '')
                setReload(prev => prev + 1)
            }
        });
    }, [folders, currentFolder])

    const handleRenameFolder = useCallback(async () => {
        if (!currentFolder || !newFolderName) return;
        const folderObj = folders.find(f => f.name === currentFolder);
        if (!folderObj) return;

        confirmPopup({
            message: `האם לשנות שם לתיקיה '${folderObj.name}' ל-'${newFolderName}'?`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: "כן",
            rejectLabel: "לא",
            accept: async () => {
                try {
                    setBusy(true);
                    const oldFolderRef = ref(storage, `${storagePath}/${currentFolder}`);

                    // List all files in the folder
                    const results = await listAll(oldFolderRef);
                    const copyPromises = results.items.map(async (file) => {
                        try {
                            const fileRef = ref(storage, `${storagePath}/${newFolderName}/${file.name}`);
                            const url = await getDownloadURL(file);
                            const response = await fetch(url);
                            const blob = await response.blob();
                            await uploadBytes(fileRef, blob);
                        } catch (error) {
                            console.error(`Failed to copy file ${file.name}:`, error);
                        }
                    });
                    await Promise.all(copyPromises);
                    // Delete the old folder after copying
                    await deleteFolder(`${storagePath}/${currentFolder}`);

                    setBusy(false);
                    appServices.showMessage('success', 'תיקיה שונתה בהצלחה', '');
                    setReload(prev => prev + 1);
                } catch (err) {
                    console.log(err);
                } finally {
                    setBusy(false);
                }
            }
        });
    }, [folders, currentFolder, newFolderName]);

    const handleRenameImage = useCallback(async () => {
        if (!currentFolder || activeIndex === null) return;
        const folderObj = folders.find(f => f.name === currentFolder);
        if (!folderObj || !folderObj.items[activeIndex]) return;

        const imageToRename = folderObj.items[activeIndex];
        const imageRef = ref(storage, `${storagePath}/${currentFolder}/${imageToRename.name}`);

        try {
            // Update only the displayName metadata
            const newMetadata = {
                customMetadata: {
                    displayName: newFileName || "", // Set new display name
                }
            };

            // Use updateMetadata to update the metadata of the file
            await updateMetadata(imageRef, newMetadata);

            appServices.showMessage('success', 'שם התמונה שונה בהצלחה', '');

            folderObj.items[activeIndex].displayName = newFileName || "";
            setFolders([...folders]);
        } catch (error) {
            console.error('Error updating metadata:', error);
            appServices.showMessage('error', 'שגיאה בעדכון שם התמונה', '');
        }
    }, [folders, currentFolder, activeIndex, newFileName]);


    const handleUpload = useCallback(async (event: any) => {
        const file = event.files[0];
        const originalFileName = file.name; // Use the original file name
        const fileRef = ref(storage, `${storagePath}/${currentFolder || ''}/${originalFileName}`);

        // Create metadata object with the custom name
        const metadata = {
            customMetadata: {
                displayName: newFileName || "", // Store the entered name as metadata
            }
        };

        // Upload the file along with its metadata
        await uploadBytes(fileRef, file, metadata);
        appServices.showMessage('success', ',תמונה עלתה בהצלחה', '');

        setUploadDialogVisible(false);
        setReload(prev => prev + 1);
    }, [currentFolder, newFileName]);

    const handleCreateFolder = useCallback(async () => {
        if (!newFolderName) return;
        const folderRef = ref(storage, `${storagePath}/${newFolderName}/placeholder.txt`);
        setBusy(true);
        await uploadBytes(folderRef, new Blob(["placeholder"])).then(() => {
            setReload(prev => prev + 1);
            setFolderInputVisible(false);
        }).finally(() => setBusy(false));

        setReload(prev => prev + 1);
        setNewFolderName('');
    }, [newFolderName]);


    const currFolder = folders.find(f => f.name == currentFolder);

    console.log("gallery", currentFolder, activeIndex);
    const maxHeight = window.innerHeight - topPosition
    return (
        <div className='flex flex-column relative justify-content-center align-items-center w-12 overflow-x-hidden'>
            {busy && <InProgress />}
            <div className='flex flex-column align-items-center relative'>
                {userInfo?.isAdmin && <div className="flex flex-row" >
                    <Button unstyled icon="pi pi-upload" onClick={() => {
                        setNewFileName("");
                        setUploadDialogVisible(true)
                    }} className="icon-btn-l mr-2" />
                    <Button unstyled icon="pi pi-folder-plus" onClick={() => setFolderInputVisible(true)} className="icon-btn-l" />
                    <Button unstyled icon="pi pi-file-edit" onClick={() => {
                        setNewFolderName(currFolder?.name || "");
                        if (currFolder && currFolder.items.length) {
                            setNewFileName(currFolder?.items[activeIndex].displayName);
                        } else {
                            setNewFileName(undefined);
                        }
                        setFileFolderEditVisible(true)
                    }
                    } className="icon-btn-l" />
                </div>}<SelectButton
                    pt={{ root: { className: "select-button-container" } }}
                    unstyled
                    value={currentFolder} onChange={(e) => {
                        if (e.value) {
                            handleFolderClick(folders, e.value); // Load folder content lazily
                        }
                    }}
                    optionLabel="name" options={folders.map(f => f.name)}
                    itemTemplate={(option) => (
                        <div className={`select-button-item ${currentFolder === option ? 'p-highlight' : ''}`}>
                            {option}
                        </div>
                    )}
                />

            </div>


            {currentFolder && (
                <div dir='ltr'>

                    {currFolder && currFolder.items.length ?

                        // <Galleria
                        //     value={currFolder.items}
                        //     className='mt-2'
                        //     showThumbnails={true}
                        //     thumbnail={thumbnailTemplate}
                        //     thumbnailsPosition="top"
                        //     numVisible={4}
                        //     item={itemTemplate}
                        //     activeIndex={activeIndex}
                        // // onItemChange={(e) => {
                        // //     console.log("item in gallery changed", e)
                        // //     setActiveIndex(e.index)
                        // // }}
                        // /> 
                        <div className="carousel-container">
                            <div className="carousel-indicators-container">
                                <ul className="p-carousel-indicators">
                                    {currFolder.items.map((_, index) => (
                                        <li
                                            key={index}
                                            className={`p-carousel-indicator ${activeIndex === index ? 'p-highlight' : ''}`}
                                            onClick={() => setActiveIndex(index)}
                                        />
                                    ))}
                                </ul>
                            </div>
                            <Carousel
                                value={currFolder.items}
                                numVisible={1}
                                numScroll={1}
                                orientation="horizontal"
                                onPageChange={(e) => setActiveIndex(e.page)}
                                page={activeIndex}
                                itemTemplate={itemTemplate}
                                showIndicators={false}
                                showNavigators={false}
                            style={{maxWidth: window.innerWidth, maxHeight}}
                            />
                        </div>


                        : <div className='text-xl mt-5'>אין עדיין תמונות</div>}

                </div>
            )}

            <Dialog style={{ direction: "rtl" }} visible={uploadDialogVisible} onHide={() => setUploadDialogVisible(false)} header="העלאת תמונה" >
                <InputText placeholder='שם/כותרת' className='w-12' value={newFileName} onChange={(e) => setNewFileName(e.target.value)} />
                <FileUpload name="image" accept="image/*" maxFileSize={1000000} customUpload uploadHandler={handleUpload} />
            </Dialog>

            <Dialog style={{ direction: "rtl", width: '70vw' }} header="שם תיקיה" visible={folderInputVisible} onHide={() => setFolderInputVisible(false)}>
                <div className="p-field">
                    <InputText value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
                    <Button label="צור תיקיה" onClick={handleCreateFolder} />
                </div>
            </Dialog>

            <Dialog style={{ direction: "rtl", width: '80vw' }} header="עריכת קובץ ותיקיה" visible={fileFolderEditVisible} onHide={() => setFileFolderEditVisible(false)}>
                <div className="p-field">
                    <div className="text-xl">שם התיקיה</div>
                    <InputText value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
                    <div className='flex flex-row mt-3 mb-5'>
                        <Button label="שמור שם חדש לתיקיה" onClick={() => {
                            handleRenameFolder()
                            setFileFolderEditVisible(false);
                        }} />
                        <Button label="מחק תיקיה" onClick={() => {
                            handleDeleteFolder()
                            setFileFolderEditVisible(false);
                        }} />
                    </div>
                </div>
                {currFolder?.items && currFolder.items.length > 0 && <div className="p-field">
                    <div className="text-xl">שם התמונה</div>
                    <InputText value={newFileName} onChange={(e) => setNewFileName(e.target.value)} />
                    <div className='flex flex-row mt-3'>
                        <Button label="שמור שם חדש לתמונה" onClick={() => {
                            handleRenameImage();
                            setFileFolderEditVisible(false);
                        }} />
                        <Button label="מחק תמונה" onClick={() => {
                            handleDeleteImage(activeIndex)
                            setFileFolderEditVisible(false);
                        }} />
                    </div>
                </div>}
            </Dialog>
        </div>
    );
};

const getFileNameWithoutExtension = (fileName: string | undefined): string => {
    if (!fileName) return "";

    return fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
};