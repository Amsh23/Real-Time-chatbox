<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>چت پیشرفته | طرح بنفش</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        /* حالت تاریک */
        :root {
            --primary: #4caf50;
            --primary-dark: #388e3c;
            --primary-light: #81c784;
            --secondary: #ff9800;
            --dark: #121212;
            --dark-2: #1e1e1e;
            --dark-3: #2d2d2d;
            --light: #e0e0e0;
            --light-2: #b0b0b0;
            --danger: #f44336;
        }

        /* حالت روشن */
        body.light-mode {
            --dark: #ffffff;
            --dark-2: #f5f5f5;
            --dark-3: #e0e0e0;
            --light: #121212;
            --light-2: #424242;
            --primary: #1976d2;
            --primary-dark: #1565c0;
            --primary-light: #64b5f6;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Vazirmatn', sans-serif;
        }

        body {
            background-color: var(--dark);
            color: var(--light);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            gap: 20px;
            height: calc(100vh - 40px);
        }

        /* سایدبار */
        .sidebar {
            width: 300px;
            background-color: var(--dark-2);
            border-radius: 12px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .profile-section {
            padding-bottom: 20px;
            border-bottom: 1px solid var(--dark-3);
        }

        .profile-section h3 {
            color: var(--primary-light);
            margin-bottom: 15px;
            font-size: 1.2rem;
        }

        #username-input {
            width: 100%;
            padding: 12px 15px;
            background-color: var(--dark-3);
            border: none;
            border-radius: 8px;
            color: var(--light);
            margin-bottom: 10px;
            font-size: 1rem;
        }

        #save-username {
            width: 100%;
            padding: 12px;
            background-color: var(--primary);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1rem;
            transition: all 0.3s;
        }

        #save-username:hover {
            background-color: var(--primary-dark);
        }

        .online-counter {
            background-color: var(--dark-3);
            color: var(--primary-light);
            padding: 8px 12px;
            border-radius: 20px;
            display: inline-flex;
            align-items: center;
            margin: 20px 0;
            font-size: 0.9rem;
        }

        .online-counter i {
            margin-left: 8px;
        }

        .group-section {
            margin-top: auto;
        }

        .group-section h3 {
            color: var(--primary-light);
            margin-bottom: 15px;
            font-size: 1.2rem;
        }

        #create-group, #join-group {
            width: 100%;
            padding: 12px;
            margin-bottom: 10px;
            background-color: var(--dark-3);
            color: var (--light);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1rem;
            transition: all 0.3s;
        }

        #create-group:hover, #join-group:hover {
            background-color: var(--primary);
        }

        #current-group-info {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid var(--dark-3);
            display: none;
        }

        #group-name {
            color: var(--primary-light);
            margin-bottom: 10px;
        }

        #invite-code {
            font-family: monospace;
            color: var(--secondary);
        }

        #copy-invite {
            width: 100%;
            padding: 8px;
            margin-top: 10px;
            background-color: var(--primary-dark);
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.3s;
        }

        #copy-invite:hover {
            background-color: var(--primary);
        }

        /* محتوای اصلی */
        .main-content {
            flex: 1;
            display: flex;
            flex-direction: column;
        }

        .chat-area {
            background-color: var(--dark-2);
            border-radius: 12px;
            padding: 20px;
            flex: 1;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        #chat-title {
            color: var(--primary-light);
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--dark-3);
        }

        #chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
            margin-bottom: 15px;
            border-radius: 8px;
            background-color: var(--dark-3);
            scrollbar-width: thin;
            scrollbar-color: var(--primary) var(--dark-2);
        }

        #chat-messages::-webkit-scrollbar {
            width: 8px;
        }

        #chat-messages::-webkit-scrollbar-track {
            background: var(--dark-2);
        }

        #chat-messages::-webkit-scrollbar-thumb {
            background-color: var(--primary);
            border-radius: 20px;
        }

        .message {
            margin-bottom: 15px;
            padding: 12px 16px;
            border-radius: 12px;
            max-width: 80%;
            position: relative;
            word-break: break-word;
            animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .my-message {
            background-color: var(--primary);
            color: white;
            margin-left: auto;
            border-bottom-right-radius: 4px;
        }

        .other-message {
            background-color: var(--dark);
            color: var(--light);
            margin-right: auto;
            border-bottom-left-radius: 4px;
        }

        .group-message {
            border-left: 3px solid var(--primary-light);
        }

        .message strong {
            display: block;
            margin-bottom: 5px;
            font-size: 0.9rem;
        }

        .my-message strong {
            color: rgba(255, 255, 255, 0.8);
        }

        .other-message strong {
            color: var(--primary-light);
        }

        .message-text {
            margin: 8px 0;
            line-height: 1.5;
        }

        .message small {
            display: block;
            text-align: left;
            font-size: 0.8rem;
            opacity: 0.7;
            margin-top: 5px;
        }

        /* پیش‌نمایش فایل‌ها */
        #preview-area {
            background-color: var(--dark-3);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 15px;
            display: none;
        }

        .preview-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            color: var(--light-2);
            font-size: 0.9rem;
        }

        #clear-preview {
            background: none;
            border: none;
            color: var(--danger);
            cursor: pointer;
            font-size: 1rem;
        }

        #file-previews {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .file-preview {
            background-color: var(--dark-2);
            border-radius: 8px;
            overflow: hidden;
        }

        .file-preview img, .file-preview video {
            max-width: 100%;
            max-height: 200px;
            display: block;
        }

        .file-info {
            padding: 8px 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .file-info span {
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-right: 10px;
            font-size: 0.9rem;
            color: var(--light);
        }

        .remove-file {
            background: none;
            border: none;
            color: var(--danger);
            cursor: pointer;
            font-size: 1rem;
        }

        .file-icon {
            padding: 15px;
            text-align: center;
            color: var(--primary-light);
            font-size: 1.5rem;
        }

        /* پیوست‌های پیام */
        .message-attachments {
            margin: 10px 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .attachment {
            border-radius: 6px;
            overflow: hidden;
        }

        .attachment.image img {
            max-width: 100%;
            max-height: 300px;
            border-radius: 6px;
        }

        .attachment.video video {
            max-width: 100%;
            max-height: 300px;
            border-radius: 6px;
        }

        .attachment.file a {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            background-color: var(--dark);
            color: var(--primary-light);
            text-decoration: none;
            border-radius: 6px;
            transition: all 0.3s;
        }

        .attachment.file a:hover {
            background-color: var(--dark-3);
        }

        .attachment.file i {
            margin-left: 8px;
            font-size: 1.2rem;
        }

        /* ناحیه ورودی */
        .input-area {
            display: flex;
            gap: 10px;
            align-items: center;
        }

        #attach-btn {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background-color: var(--dark-3);
            color: var(--primary-light);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
            transition: all 0.3s;
        }

        #attach-btn:hover {
            background-color: var(--primary);
            color: white;
        }

        #file-input {
            display: none;
        }

        #message-input {
            flex: 1;
            padding: 14px 18px;
            background-color: var(--dark-3);
            border: none;
            border-radius: 24px;
            color: var(--light);
            font-size: 1rem;
            outline: none;
        }

        #message-input::placeholder {
            color: var(--light-2);
        }

        #send-button {
            padding: 14px 24px;
            background-color: var(--primary);
            color: white;
            border: none;
            border-radius: 24px;
            cursor: pointer;
            font-size: 1rem;
            transition: all 0.3s;
        }

        #send-button:hover {
            background-color: var(--primary-dark);
        }

        /* نوتیفیکیشن */
        .toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-family: 'Vazirmatn', sans-serif;
            transform: translateY(100px);
            opacity: 0;
            transition: all 0.3s ease;
            z-index: 1000;
        }
        
        .toast.show {
            transform: translateY(0);
            opacity: 1;
        }
        
        .toast-success {
            background-color: #4caf50;
        }
        
        .toast-error {
            background-color: #f44336;
        }

        /* نسخه موبایل */
        @media (max-width: 768px) {
            .container {
                flex-direction: column;
                height: auto;
            }

            .sidebar {
                width: 100%;
                margin-bottom: 20px;
            }

            #chat-messages {
                max-height: 50vh;
            }
        }

        .user.online::before {
            content: '';
            width: 10px;
            height: 10px;
            background-color: var(--primary);
            border-radius: 50%;
            display: inline-block;
            margin-left: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="sidebar">
            <div class="profile-section">
                <h3><i class="fas fa-user-circle"></i> پروفایل کاربری</h3>
                <input id="username-input" placeholder="نام کاربری خود را وارد کنید">
                <button id="save-username"><i class="fas fa-save"></i> ذخیره</button>
            </div>
            
            <div class="online-counter">
                <i class="fas fa-users"></i>
                کاربران آنلاین: <span id="online-count">0</span>
            </div>
            
            <div class="group-section">
                <h3><i class="fas fa-users"></i> مدیریت گروه‌ها</h3>
                <button id="create-group"><i class="fas fa-plus"></i> ساخت گروه جدید</button>
                <button id="join-group"><i class="fas fa-sign-in-alt"></i> عضویت در گروه</button>
                <div id="current-group-info">
                    <h4 id="group-name"></h4>
                    <p>کد دعوت: <span id="invite-code"></span></p>
                    <button id="copy-invite"><i class="fas fa-copy"></i> کپی لینک دعوت</button>
                </div>
            </div>
        </div>
        
        <div class="main-content">
            <div class="chat-area">
                <h2 id="chat-title"><i class="fas fa-comments"></i> چت عمومی</h2>
                <div id="chat-messages"></div>
                
                <div id="preview-area">
                    <div class="preview-header">
                        <span><i class="fas fa-paperclip"></i> فایل‌های ضمیمه شده</span>
                        <button id="clear-preview"><i class="fas fa-trash"></i></button>
                    </div>
                    <div id="file-previews"></div>
                </div>
                
                <div class="input-area">
                    <button id="attach-btn" title="ضمیمه کردن فایل">
                        <i class="fas fa-paperclip"></i>
                        <input type="file" id="file-input" multiple accept="image/*,video/*,.gif,.pdf">
                    </button>
                    
                    <input id="message-input" placeholder="پیام خود را بنویسید...">
                    
                    <button id="send-button"><i class="fas fa-paper-plane"></i> ارسال</button>
                </div>
            </div>
        </div>
    </div>

    <div class="theme-toggle">
        <button id="toggle-theme"><i class="fas fa-moon"></i></button>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script src="/script.js"></script>
</body>
</html>
