param(
  [Parameter(Mandatory=$true)][string]$OAuthClientJson,
  [switch]$ValidateOnly,
  # Use only after the supplied client's Google authorize endpoint accepts our callback.
  [switch]$CallbackVerified
)
$ErrorActionPreference = 'Stop'
$webDir = Split-Path -Parent $PSScriptRoot
$projectRef = 'tpdjptjcqyinapcqfjji'
$callback = "https://$projectRef.supabase.co/auth/v1/callback"
$client = (Get-Content -LiteralPath $OAuthClientJson -Raw -Encoding utf8 | ConvertFrom-Json).web
if (-not $client) { throw 'Select the JSON for a Google Web application OAuth client.' }
$clientId = ([string]$client.client_id).Trim()
$clientSecret = ([string]$client.client_secret).Trim()
if ($clientId -notmatch '^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$') { throw 'Invalid Google OAuth client ID.' }
if (-not $clientSecret -or $clientSecret -match '^(\*+|YOUR[_ -]|REPLACE[_ -])' -or $clientSecret -eq $clientId) { throw 'Google client secret is missing or is a placeholder.' }
$hasRedirectMetadata = $null -ne $client.PSObject.Properties['redirect_uris']
if ($hasRedirectMetadata -and @($client.redirect_uris) -notcontains $callback) { throw "Add $callback to the client redirect URIs and download its JSON again." }
if ($ValidateOnly) { Write-Output 'OAuth JSON structure validated; callback metadata may be absent. Google has not verified the credentials.'; exit 0 }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class SupabaseCredential {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
 public struct Credential { public UInt32 Flags; public UInt32 Type; public string TargetName; public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public UInt32 CredentialBlobSize; public IntPtr CredentialBlob; public UInt32 Persist; public UInt32 AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
 [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool Read(string target, UInt32 type, UInt32 reserved, out IntPtr credential);
 [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr buffer);
 public static string Token() {
  IntPtr ptr;
  if (!Read("Supabase CLI:supabase", 1, 0, out ptr)) throw new Exception("Supabase CLI credential unavailable");
  try { var c=(Credential)Marshal.PtrToStructure(ptr,typeof(Credential)); byte[] bytes=new byte[c.CredentialBlobSize]; Marshal.Copy(c.CredentialBlob,bytes,0,bytes.Length); return System.Text.Encoding.UTF8.GetString(bytes).TrimEnd('\0'); }
  finally { CredFree(ptr); }
 }
}
'@

$headers = @{ Authorization = "Bearer $([SupabaseCredential]::Token())" }
$endpoint = "https://api.supabase.com/v1/projects/$projectRef/config/auth"
$config = Invoke-RestMethod -Uri $endpoint -Headers $headers
if (-not $hasRedirectMetadata -and $config.external_google_client_id -ne $clientId -and -not $CallbackVerified) {
  throw 'This is a different OAuth client without redirect metadata. Verify its Supabase callback in Google before changing clients.'
}
$origin = (Get-Content -Raw -LiteralPath (Join-Path $webDir '.runtime/public-portals-url.txt')).Trim()
$originUri = [Uri]$origin
if ($originUri.Scheme -ne 'https' -or $originUri.AbsolutePath -ne '/') { throw 'Invalid public portal origin.' }
$redirects = @(([string]$config.uri_allow_list -split ',') | Where-Object { $_ }) + "$origin/user/signup/google"
$body = @{
 external_google_enabled = $true
 external_google_client_id = $clientId
 external_google_secret = $clientSecret
 uri_allow_list = (($redirects | Select-Object -Unique) -join ',')
} | ConvertTo-Json -Compress
$null = Invoke-RestMethod -Method Patch -Uri $endpoint -Headers $headers -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body))
$verified = Invoke-RestMethod -Uri $endpoint -Headers $headers
if (-not $verified.external_google_enabled -or $verified.external_google_client_id -ne $clientId -or [string]::IsNullOrWhiteSpace($verified.external_google_secret)) { throw 'Saved Google provider settings did not match the supplied configuration.' }
# The management API can return an opaque secret representation, not its original value.
# Do not treat a successful settings write as proof of Google's token exchange.
Write-Output 'Google configuration saved; enabled provider, client ID and secret presence verified. Complete a real Google sign-in to verify the provider exchange.'
Write-Output "Login: $origin/user/login"
