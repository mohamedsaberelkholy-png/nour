package local.nour.android;

import android.app.*;
import android.os.*;
import android.content.*;
import android.graphics.Color;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    static final int BG = Color.rgb(7,18,23), PANEL = Color.rgb(12,27,34), AQUA = Color.rgb(86,239,214), MUTED = Color.rgb(139,164,167);
    LinearLayout content, messages; EditText composer; TextView status; SharedPreferences prefs; ExecutorService executor = Executors.newSingleThreadExecutor();
    String baseUrl;

    @Override public void onCreate(Bundle state) { super.onCreate(state); prefs = getSharedPreferences("nour", MODE_PRIVATE); baseUrl = prefs.getString("baseUrl", "http://10.0.2.2:4111"); buildShell(); if (prefs.getBoolean("setupComplete", false)) showChat(); else showSetup(); refresh(); }
    TextView text(String value, float size, int color) { TextView v = new TextView(this); v.setText(value); v.setTextSize(size); v.setTextColor(color); v.setPadding(20,14,20,14); return v; }
    Button button(String value) { Button b = new Button(this); b.setText(value); b.setTextColor(Color.WHITE); b.setAllCaps(false); b.setBackgroundColor(Color.rgb(22,57,64)); return b; }
    void buildShell() {
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(BG);
        LinearLayout header = new LinearLayout(this); header.setGravity(Gravity.CENTER_VERTICAL); header.setPadding(20,18,20,10);
        TextView title = text("NOUR\nLOCAL ASSISTANT", 20, AQUA); title.setTypeface(null, 1); header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        status = text("● OFFLINE", 12, MUTED); header.addView(status); root.addView(header);
        content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(16,8,16,8); root.addView(content, new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout nav = new LinearLayout(this); nav.setPadding(8,4,8,8); String[] labels={"Chat","Tasks","Reminders","Settings"}; for(String label:labels){ Button b=button(label); b.setOnClickListener(v->{ if(label.equals("Chat"))showChat(); else if(label.equals("Tasks"))showTasks(); else if(label.equals("Reminders"))showReminders(); else showSettings(); }); nav.addView(b,new LinearLayout.LayoutParams(0,56,1)); } root.addView(nav);
        setContentView(root);
    }
    void clear(String heading) { content.removeAllViews(); content.addView(text(heading, 26, Color.WHITE)); }
    void showSetup() {
        clear("Set up Nour");
        content.addView(text("Nour will prepare this phone, verify its service connection, and ask Android only for permissions required for notifications.", 15, MUTED));
        LinearLayout checklist = new LinearLayout(this); checklist.setOrientation(LinearLayout.VERTICAL); checklist.setPadding(0,18,0,18);
        TextView app = text("✓  Nour app installed", 16, AQUA); TextView notify = text("○  Browser-style reminder notifications", 16, MUTED); TextView service = text("○  Local Nour service connection", 16, MUTED);
        checklist.addView(app); checklist.addView(notify); checklist.addView(service); content.addView(checklist);
        TextView note = text("This app cannot silently install other apps or bypass Android confirmation. Computer-control features remain available only when the configured Nour service is reachable.", 13, MUTED); content.addView(note);
        Button setup = button("Set up this phone"); setup.setOnClickListener(v -> { setup.setEnabled(false); if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 42); notify.setText("✓  Notification permission requested"); notify.setTextColor(AQUA); checkService(service, setup); }); content.addView(setup);
        Button continueButton = button("Continue without notifications"); continueButton.setOnClickListener(v -> { prefs.edit().putBoolean("setupComplete", true).apply(); showChat(); }); content.addView(continueButton);
    }
    void checkService(TextView service, Button setup) { request("/api/health", "GET", null, result -> { service.setText("✓  Local Nour service connected"); service.setTextColor(AQUA); setup.setText("Finish setup"); setup.setEnabled(true); setup.setOnClickListener(v -> { prefs.edit().putBoolean("setupComplete", true).apply(); showChat(); }); }, false); }
    void showChat() {
        clear("Command Center"); ScrollView scroll=new ScrollView(this); messages=new LinearLayout(this); messages.setOrientation(LinearLayout.VERTICAL); messages.addView(text("NOUR\nI’m ready. Approved actions will always ask first.",14,Color.WHITE)); scroll.addView(messages); content.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout row=new LinearLayout(this); composer=new EditText(this); composer.setHint("Ask Nour…"); composer.setHintTextColor(MUTED); composer.setTextColor(Color.WHITE); composer.setSingleLine(true); row.addView(composer,new LinearLayout.LayoutParams(0,60,1)); Button send=button("Send"); send.setOnClickListener(v->sendChat()); row.addView(send,new LinearLayout.LayoutParams(110,60)); content.addView(row);
    }
    void addMessage(String who, String value) { if(messages==null)return; TextView v=text(who.toUpperCase()+"\n"+value,14,Color.WHITE); v.setBackgroundColor(PANEL); v.setPadding(14,12,14,12); LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2); p.setMargins(0,6,0,6); messages.addView(v,p); }
    void sendChat() { String value=composer.getText().toString().trim(); if(value.isEmpty())return; addMessage("You",value); composer.setText(""); request("/api/chat", "POST", json("text",value), result->{ addMessage("Nour",result.optString("text","No response.")); if("approval_required".equals(result.optString("status"))) approval(result); }); }
    void approval(JSONObject result) { new AlertDialog.Builder(this).setTitle("Approval required").setMessage(result.optJSONObject("approval").optString("summary","Nour requests permission.")).setNegativeButton("Reject",(d,w)->approve(result.optString("actionId"),false)).setPositiveButton("Approve",(d,w)->approve(result.optString("actionId"),true)).show(); }
    void approve(String id, boolean accepted) { JSONObject body=new JSONObject(); try{body.put("actionId",id);body.put("approved",accepted);}catch(Exception ignored){} request("/api/actions/approve","POST",body,result->addMessage("Nour",result.optString("text","Approval processed."))); }
    void showTasks() { clear("Tasks"); request("/api/tasks","GET",null,result->{ try { JSONArray a=result.getJSONArray("tasks"); if(a.length()==0)content.addView(text("No tasks yet.",15,MUTED)); for(int i=0;i<a.length();i++){JSONObject t=a.getJSONObject(i); content.addView(text((t.optString("status").equals("completed")?"✓ ":"○ ")+t.optString("title")+"\n"+t.optString("priority","medium"),15,Color.WHITE));} }catch(Exception e){error(e);}}); }
    void showReminders() { clear("Reminders"); request("/api/reminders","GET",null,result->{ try {JSONArray a=result.getJSONArray("reminders"); if(a.length()==0)content.addView(text("No reminders yet.",15,MUTED)); for(int i=0;i<a.length();i++){JSONObject r=a.getJSONObject(i);content.addView(text((r.optString("status").equals("due")?"● DUE ":"◷ ")+r.optString("title")+"\n"+r.optString("dueAt"),15,Color.WHITE));}}catch(Exception e){error(e);}}); }
    void showSettings() { clear("Connection"); content.addView(text("Nour runs locally. On an emulator, use 10.0.2.2 for the host computer. A physical phone needs a reachable Nour host and an intentional network binding.",14,MUTED)); EditText url=new EditText(this); url.setText(baseUrl); url.setTextColor(Color.WHITE); url.setHintTextColor(MUTED); url.setHint("http://10.0.2.2:4111"); content.addView(url); Button save=button("Save service URL"); save.setOnClickListener(v->{baseUrl=url.getText().toString().replaceAll("/$","");prefs.edit().putString("baseUrl",baseUrl).apply(); refresh();}); content.addView(save); }
    void refresh() { request("/api/health","GET",null,result->{status.setText("● ONLINE");status.setTextColor(AQUA);},false); }
    JSONObject json(String key,String value){JSONObject o=new JSONObject();try{o.put(key,value);}catch(Exception ignored){}return o;}
    interface Callback { void done(JSONObject result); }
    void request(String path,String method,JSONObject body,Callback cb){request(path,method,body,cb,true);}
    void request(String path,String method,JSONObject body,Callback cb,boolean showError){ executor.execute(()->{ try { HttpURLConnection c=(HttpURLConnection)new URL(baseUrl+path).openConnection(); c.setRequestMethod(method); c.setConnectTimeout(7000);c.setReadTimeout(12000);c.setRequestProperty("Content-Type","application/json"); if(body!=null){c.setDoOutput(true);try(OutputStream out=c.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}} int code=c.getResponseCode(); InputStream in=code<400?c.getInputStream():c.getErrorStream(); StringBuilder s=new StringBuilder();try(BufferedReader r=new BufferedReader(new InputStreamReader(in))){String line;while((line=r.readLine())!=null)s.append(line);} JSONObject out=new JSONObject(s.toString()); runOnUiThread(()->cb.done(out)); }catch(Exception e){runOnUiThread(()->{status.setText("● OFFLINE");status.setTextColor(Color.rgb(255,140,120));if(showError)error(e);});} }); }
    void error(Exception e){Toast.makeText(this,"Nour unavailable: "+e.getMessage(),Toast.LENGTH_LONG).show();}
    @Override protected void onDestroy(){executor.shutdownNow();super.onDestroy();}
}
