# Always clear all sessions on restart
print("🐍 views.py MODULE LOADED") # DEBUG IMPORT
from django.contrib.sessions.models import Session
Session.objects.all().delete()

from django.shortcuts import render, redirect
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.http import JsonResponse
import markdown
import os
import pandas as pd
from .llm_loader_updated import unload_model, query_rag, load_all_vector_dbs
from transformers import AutoTokenizer
from .vector_db_builder import create_or_update_vdb_from_folder
from .utils import extract_text_from_file
import re

csv_path = os.path.abspath(os.path.join(settings.BASE_DIR, "authorized_users.csv"))
# Clear all sessions on first restart
if not os.path.exists("session_reset.flag"):
    Session.objects.all().delete()
    with open("session_reset.flag", "w") as f:
        f.write("cleared")
tokenizer = AutoTokenizer.from_pretrained("intfloat/e5-small-v2")

import functools
import traceback
def debug_trace(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            print(f"\n❌ [DEBUGGER] Error in {func.__name__}: {e}")
            traceback.print_exc()
            raise e
    return wrapper

history_token_limit = 2000
vector_dbs_loaded = False

@debug_trace
def enter_id(request):
    error = None
    if request.method == "POST":
        user_id = request.POST.get("user_id", "").strip()
        try:
            df = pd.read_csv(csv_path)
            if user_id in df["ID"].astype(str).values:
                request.session["user_id"] = user_id
                return redirect("face_chat")
            else:
                error = "❌ Unauthorized ID."
        except Exception as e:
            error = f"⚠️ Failed to check ID: {e}"
    return render(request, "login.html", {"error": error})

def count_tokens(text):
    return len(tokenizer.encode(text, add_special_tokens=False))

def trim_history(history, token_limit):
    total_tokens = 0
    trimmed = []
    for turn in reversed(history):
        turn_text = f"Input: {turn['user']}\nOutput: {turn['assistant']}\n"
        tokens = count_tokens(turn_text)
        if total_tokens + tokens > token_limit:
            break
        trimmed.insert(0, turn)
        total_tokens += tokens
    return trimmed

@csrf_exempt
@debug_trace
def face_chat(request):
    try:
        global vector_dbs_loaded
        if "user_id" not in request.session:
            return redirect("enter_id")
        
        chat_history = request.session.get("chat_history", [])

        context = {
            "chat_history": chat_history,
            "show_uploader": False,
            "max_tokens": 1000,
            "history_token_limit": history_token_limit,
        }

        if request.method == "POST":
            action = request.POST.get("action")

            if action == "submit_file":
                uploaded_file = request.FILES.get("query_file")
                if uploaded_file:
                    extracted_text = extract_text_from_file(uploaded_file)
                    trimmed = trim_history(chat_history, history_token_limit)
                    try:
                        response = query_rag(extracted_text, trimmed)
                        print(f"\n\n🤖 MODEL OUTPUT (FILE):\n{response}\n\n") # Print to terminal
                        cleaned = response.strip()
                        # Removed bold-to-heading conversion to prevent whole-paragraph headings
                        cleaned = re.sub(r'^\s*[-•‣]\s*', '- ', cleaned, flags=re.MULTILINE)
                        cleaned = re.sub(r'(?<!\n)\n(-\s)', r'\n\n\1', cleaned)
                        cleaned = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F]', '', cleaned)

                        base_dir = os.path.dirname(os.path.abspath(__file__))
                        with open(os.path.join(base_dir, "llm_output_debug.txt"), "w", encoding="utf-8") as f:
                            f.write(response)

                        html_response = markdown.markdown(cleaned, extensions=["extra", "sane_lists", "toc", "smarty"])
                        with open(os.path.join(base_dir, "llm_output_rendered.html"), "w", encoding="utf-8") as f:
                            f.write(html_response)

                    except Exception as e:
                        html_response = f"<p><strong>⚠️ Error:</strong> {str(e)}</p>"

                    chat_history.append({"user": f"[File] {uploaded_file.name}", "assistant": html_response})



            elif action == "submit_query":
                user_input = request.POST.get("user_input", "").strip()
                if user_input:
                    trimmed = trim_history(chat_history, history_token_limit)
                    try:
                        response = query_rag(user_input, trimmed)
                        print(f"\n\n🤖 MODEL OUTPUT (TEXT):\n{response}\n\n") # Print to terminal
                        cleaned = response.strip()
                        # Removed bold-to-heading conversion to prevent whole-paragraph headings
                        cleaned = re.sub(r'^\s*[-•‣]\s*', '- ', cleaned, flags=re.MULTILINE)
                        cleaned = re.sub(r'(?<!\n)\n(-\s)', r'\n\n\1', cleaned)
                        cleaned = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F]', '', cleaned)

                        base_dir = os.path.dirname(os.path.abspath(__file__))
                        with open(os.path.join(base_dir, "llm_output_debug.txt"), "w", encoding="utf-8") as f:
                            f.write(response)

                        html_response = markdown.markdown(cleaned, extensions=["extra", "sane_lists", "toc", "smarty"])
                        with open(os.path.join(base_dir, "llm_output_rendered.html"), "w", encoding="utf-8") as f:
                            f.write(html_response)

                    except Exception as e:
                        html_response = f"<p><strong>⚠️ Error:</strong> {str(e)}</p>"

                    chat_history.append({"user": user_input, "assistant": html_response})



            elif action == "clear_history":
                chat_history = []

            elif action == "train_model":
                unload_model()
                previous = request.session.get("show_uploader", False)
                new_state = not previous
                request.session["show_uploader"] = new_state
                request.session["show_add_user_form"] = False  # hide others
                context["show_uploader"] = new_state
                context["show_admin_modal"] = True

            elif action == "upload_pdfs":
                files = request.FILES.getlist("pdfs")
                if not files:
                    context["upload_error"] = "⚠️ Please select at least one PDF file to upload."
                    context["show_uploader"] = True
                    context["show_admin_modal"] = True
                else:
                    folder_temp = "uploaded_pdfs"
                    os.makedirs(folder_temp, exist_ok=True)

                    for f in os.listdir(folder_temp):
                        os.remove(os.path.join(folder_temp, f))

                    for file in files:
                        path = os.path.join(folder_temp, file.name)
                        with open(path, "wb+") as dest:
                            for chunk in file.chunks():
                                dest.write(chunk)

                    failed_files = create_or_update_vdb_from_folder(folder_temp)
                    load_all_vector_dbs()
                    vector_dbs_loaded = True
                    context["show_admin_modal"] = True
                    if failed_files:
                        context["upload_error"] = "Some PDFs could not be processed:<br>" + "<br>".join(failed_files)


                
            elif action == "reveal_add_user":
                previous = request.session.get("show_add_user_modal", True)
                new_state = not previous
                request.session["show_add_user_modal"] = True
                request.session["show_uploader"] = False  # hide others
                context["show_add_user_modal"] = True
                context["show_admin_modal"] = True

            elif action == "add_user":
                new_id = request.POST.get("new_user_id", "").strip()
                new_name = request.POST.get("new_user_name", "").strip()
                try:
                    df = pd.read_csv(csv_path)
                    if new_id and new_name and new_id not in df["ID"].astype(str).values:
                        df.loc[len(df)] = [new_id, new_name]
                        df.to_csv(csv_path, index=False)
                        context["add_user_message"] = f"✅ User {new_name} added."
                    else:
                        context["add_user_message"] = "⚠️ ID already exists or fields are empty."
                except Exception as e:
                    context["add_user_message"] = f"❌ Failed to add user: {e}"
                    context["show_admin_modal"] = True
            elif action == "close_add_user":
                context["show_admin_modal"] = True
                context["show_add_user_modal"] = False
            elif action == "reveal_remove_user":
                try:
                    df = pd.read_csv(csv_path, dtype=str)
                    user_list = df[df["ID"] != "737"]  
                    print("🟢 CSV LOADED:", df.head().to_dict(orient="records"))  # <--- Debug print
                    context["user_list"] = df.to_dict(orient="records")
                except Exception as e:
                    print("❌ CSV LOAD FAILED:", e)
                    context["user_list"] = []
                context["show_remove_user_modal"] = True
                context["show_admin_modal"] = True

            elif action and action.startswith("remove_user_"):
                try:
                    user_id_to_remove = action.replace("remove_user_", "")
                    df = pd.read_csv(csv_path, dtype=str)
                    initial_count = len(df)
                    df = df[df["ID"] != user_id_to_remove]
                    if len(df) < initial_count:
                        df.to_csv(csv_path, index=False)
                        print("📄 CSV PATH:", csv_path)
                        print("📄 FILE EXISTS:", os.path.exists(csv_path))
                        print("📄 CSV CONTENTS:", df.head().to_dict(orient="records"))
                        context["user_list"] = df.to_dict(orient="records")
                        context["show_remove_user_modal"] = True
                        context["show_admin_modal"] = True
                        context["admin_message"] = f"✅ User with ID {user_id_to_remove} removed."
                    else:
                        context["admin_message"] = "⚠️ User ID not found."
                except Exception as e:
                    context["admin_message"] = f"❌ Failed to remove user: {e}"
            elif action == "close_remove_user":
                context["show_admin_modal"] = True  
            # ✅ Save updated history to session
            request.session["chat_history"] = chat_history

        context["chat_history"] = chat_history
        context["is_host"] = (request.session.get("user_id") == "737")
        return render(request, "face_chat.html", context)
    
    except Exception as e:
        print(f"❌ Unhandled error in face_chat: {e}")
        # Display a friendly error page or message
        return render(
            request,
            "face_chat.html",
            {
                "chat_history": [],
                "error": f"⚠️ System error: {str(e)}. Please try again or contact support.",
                "is_host": os.path.exists("host_flag.txt"),
            }
        )
  
@csrf_exempt
@debug_trace
def chat_api(request):
    if request.method == 'POST':
        if 'user_id' not in request.session:
            return JsonResponse({'error': 'Unauthorized'}, status=401)
        chat_history = request.session.get('chat_history', [])
        
        # Handle both JSON and form data
        if request.content_type == 'application/json':
            import json
            data = json.loads(request.body)
            query = data.get('query', '')
            max_tokens = data.get('max_tokens', 1000)
        else:
            query = request.POST.get('query', '')
            max_tokens = request.POST.get('max_tokens', 1000)
        
        file = request.FILES.get('file')
        if file:
            extracted_text = extract_text_from_file(file)
            user_input = extracted_text
            user_display = f"[File] {file.name}"
        else:
            user_input = query
            user_display = user_input
        trimmed = trim_history(chat_history, history_token_limit)
        try:
            response = query_rag(user_input, trimmed)
            print(f"\n\n🤖 MODEL OUTPUT (API):\n{response}\n\n") # Print to terminal
            cleaned = response.strip()
            # Removed bold-to-heading conversion to prevent whole-paragraph headings
            cleaned = re.sub(r'^\s*[-•‣]\s*', '- ', cleaned, flags=re.MULTILINE)
            cleaned = re.sub(r'(?<!\n)\n(-\s)', r'\n\n\1', cleaned)
            cleaned = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F]', '', cleaned)
            html_response = markdown.markdown(cleaned, extensions=["extra", "sane_lists", "toc", "smarty"])
            chat_history.append({"user": user_display, "assistant": html_response})
            request.session["chat_history"] = chat_history
            return JsonResponse({'reply': html_response})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
@debug_trace
def upload_api(request):
    if request.method == 'POST':
        if 'user_id' not in request.session:
            return JsonResponse({'error': 'Unauthorized'}, status=401)
        try:
            files = request.FILES.getlist('files')  # Changed from 'pdfs' to 'files' to match JS
            if not files:
                return JsonResponse({'error': 'No files provided'}, status=400)
            folder_temp = "uploaded_pdfs"
            os.makedirs(folder_temp, exist_ok=True)
            for f in os.listdir(folder_temp):
                os.remove(os.path.join(folder_temp, f))
            for file in files:
                path = os.path.join(folder_temp, file.name)
                with open(path, "wb+") as dest:
                    for chunk in file.chunks():
                        dest.write(chunk)
            
            # This function might fail if dependencies are missing or files are corrupt
            failed_files = create_or_update_vdb_from_folder(folder_temp)
            load_all_vector_dbs()
            global vector_dbs_loaded
            vector_dbs_loaded = True
            if failed_files:
                return JsonResponse({'error': 'Some PDFs could not be processed: ' + ', '.join(failed_files)}, status=400)
            return JsonResponse({'message': 'Upload successful'})
        except Exception as e:
            print(f"❌ Upload API Error: {e}")
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
@debug_trace
def train_api(request):
    if request.method == 'POST':
        if 'user_id' not in request.session:
            return JsonResponse({'error': 'Unauthorized'}, status=401)
        # Handle JSON
        if request.content_type == 'application/json':
            import json
            data = json.loads(request.body)
            action = data.get('action')
        else:
            action = request.POST.get('action')
        if action == 'train':
            unload_model()
            return JsonResponse({'message': 'Model unloaded for training'})
        return JsonResponse({'error': 'Invalid action'}, status=400)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
@debug_trace
def users_api(request):
    if request.method == 'POST':
        if 'user_id' not in request.session:
            return JsonResponse({'error': 'Unauthorized'}, status=401)
        # Handle JSON
        if request.content_type == 'application/json':
            import json
            data = json.loads(request.body)
            action = data.get('action')
            new_id = data.get('new_user_id', '').strip()
            new_name = data.get('new_user_name', '').strip()
            user_id_to_remove = data.get('user_id_to_remove', '').strip()
        else:
            action = request.POST.get('action')
            new_id = request.POST.get('new_user_id', '').strip()
            new_name = request.POST.get('new_user_name', '').strip()
            user_id_to_remove = request.POST.get('user_id_to_remove', '').strip()
        if action == 'add_user':
            try:
                df = pd.read_csv(csv_path)
                if new_id and new_name and new_id not in df['ID'].astype(str).values:
                    df.loc[len(df)] = [new_id, new_name]
                    df.to_csv(csv_path, index=False)
                    return JsonResponse({'message': f'User {new_name} added'})
                else:
                    return JsonResponse({'error': 'ID already exists or fields empty'}, status=400)
            except Exception as e:
                return JsonResponse({'error': str(e)}, status=500)
        elif action == 'remove_user':
            try:
                df = pd.read_csv(csv_path, dtype=str)
                initial_count = len(df)
                df = df[df['ID'] != user_id_to_remove]
                if len(df) < initial_count:
                    df.to_csv(csv_path, index=False)
                    return JsonResponse({'message': f'User {user_id_to_remove} removed'})
                else:
                    return JsonResponse({'error': 'User ID not found'}, status=400)
            except Exception as e:
                return JsonResponse({'error': str(e)}, status=500)
        elif action == 'get_users':
            try:
                df = pd.read_csv(csv_path, dtype=str)
                users = df.to_dict(orient='records')
                return JsonResponse({'users': users})
            except Exception as e:
                return JsonResponse({'error': str(e)}, status=500)
        return JsonResponse({'error': 'Invalid action'}, status=400)
    return JsonResponse({'error': 'Method not allowed'}, status=405)
