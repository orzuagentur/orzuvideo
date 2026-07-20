-- Allow larger device uploads for AI Clipping source videos
update storage.buckets
set file_size_limit = 524288000 -- 500 MB
where id = 'short-previews';
