# <project_folder>/urls.py
from django.contrib import admin
from django.urls import path  # (you can remove include if you’re not using it)
from api_views import cloudflare_api
from civilapp import views
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),

    # NEW: login/ID entry page (this name must match redirect("enter_id"))
    path('', views.enter_id, name='enter_id'),          # root route shows the login/ID form
    path('enter-id/', views.enter_id, name='enter_id'), # optional alias, same name

    # Chat endpoints
    path('chat/', views.face_chat, name='face_chat'),
    path('chat', views.face_chat, name='face_chat_noslash'),  # optional: handle no slash

    # Netlify/Cloudflare helper
    path('get-tunnel-url/', cloudflare_api, name='cloudflare_api'),

    # API Endpoints
    path('api/chat/', views.chat_api, name='chat_api'),
    path('api/upload/', views.upload_api, name='upload_api'),
    path('api/train/', views.train_api, name='train_api'),
    path('api/users/', views.users_api, name='users_api'),
    path('api/status/', views.stats_api, name='stats_api'),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0])
