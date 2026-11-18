-- Raise the encrypted-files bucket cap to 100 MB of plaintext.
-- Ciphertext is plaintext + 16-byte AES-GCM tag, so allow 1 KiB headroom.
-- NOTE: the project-wide upload limit (Dashboard > Storage > Settings) must
-- also be >= this value; on the Supabase free tier it is capped at 50 MB.
update storage.buckets
set file_size_limit = 104858624 -- 100 MiB + 1 KiB
where id = 'encrypted-files';
