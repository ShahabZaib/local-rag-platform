# api_views.py
from django.http import JsonResponse
from cloudflare_manager import get_cloudflare_url 
 
def cloudflare_api(request):
    url = get_cloudflare_url()
    if url:
        return JsonResponse({"status": "success", "public_url": url})
    else:
        return JsonResponse({"status": "error", "message": "Tunnel failed or not found"})
