import os
from pathlib import Path
SECRET_KEY = "0@y)gp=!=wot8+g93(595cyz+v4&#+g^yvke!h94kfgny2e2lt"
DEBUG = True
BASE_DIR = Path(__file__).resolve().parent.parent
ALLOWED_HOSTS = ['.trycloudflare.com', '127.0.0.1', 'localhost', 'facemce.netlify.app']
ROOT_URLCONF = 'civilweb.urls'
APPEND_SLASH=False
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    'civilapp',  # 👈 your app
]
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, 'civilapp', 'templates')],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

STATICFILES_DIRS = [
    os.path.join(BASE_DIR, 'civilapp', 'static'),  # 👈 path to your static folder
]
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',  # ✅ REQUIRED
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',  # ✅ REQUIRED
    'django.contrib.messages.middleware.MessageMiddleware',  # ✅ REQUIRED
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# Add static file serving for development
if DEBUG:
    from django.conf import settings
    from django.conf.urls.static import static
    from django.urls import path
    
    # This will be added to urlpatterns in urls.py
    STATICFILES_DIRS = [
        os.path.join(BASE_DIR, 'civilapp', 'static'),  # 👈 path to your static folder
    ]
    
    # Serve static files during development
    STATIC_URL = '/static/'
    STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
    
    # Enable static file serving in development
    STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.StaticFilesStorage'
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',  # ✅ This is the minimum required
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}
ALLOWED_HOSTS = ["127.0.0.1", "localhost", ".trycloudflare.com", "your-tunnel-subdomain.trycloudflare.com"]

CSRF_TRUSTED_ORIGINS = [
    "https://civilai.netlify.app",
    "https://your-tunnel-subdomain.trycloudflare.com",
]

# If using django-cors-headers:
CORS_ALLOWED_ORIGINS = [
    "https://civilai.netlify.app",
    "https://your-tunnel-subdomain.trycloudflare.com",
]

STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
SESSION_COOKIE_AGE = 1800
SESSION_SAVE_EVERY_REQUEST = True
CSRF_TRUSTED_ORIGINS = [
    "https://*.trycloudflare.com"
]