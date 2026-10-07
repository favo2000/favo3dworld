-- Only gallery ordering; existing permissions and payment functions remain unchanged.
alter table public.portfolio_projects add column sort_order integer not null default 1000 constraint portfolio_sort_order_range check (sort_order between 1 and 1000000);
with ranked as (select id,row_number() over (order by created_at desc,id desc) as position from public.portfolio_projects)
update public.portfolio_projects p set sort_order=r.position from ranked r where p.id=r.id;
create index portfolio_manual_order on public.portfolio_projects(sort_order asc,created_at desc,id desc) where published;
