do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'product-images'
      and public = true
  ) then
    raise exception 'Missing public product-images bucket';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'product_images_public_read'
  ) then
    raise exception 'Missing public product image read policy';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'product_images_admin_insert'
  ) then
    raise exception 'Missing product image admin insert policy';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'product_images_admin_delete'
  ) then
    raise exception 'Missing product image admin delete policy';
  end if;
end;
$$;
