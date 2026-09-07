-- 0021: Exo Core expansion — answer groups for the new concepts
begin;
insert into public.answer_groups (grp, lang, answer) values
('saturn','en','saturn'),
('saturn','es','saturno'),
('saturn','fr','saturne'),
('saturn','de','saturn'),
('saturn','it','saturno'),
('saturn','pt','saturno'),
('saturn','nl','saturnus'),
('saturn','sv','saturnus'),
('saturn','tr','satürn'),
('saturn','pl','saturn'),
('saturn','ru','сатурн'),
('saturn','ar','زحل'),
('saturn','hi','शनि'),
('shadow','en','shadow'),
('shadow','es','sombra'),
('shadow','fr','ombre'),
('shadow','de','schatten'),
('shadow','it','ombra'),
('shadow','pt','sombra'),
('shadow','nl','schaduw'),
('shadow','sv','skugga'),
('shadow','tr','gölge'),
('shadow','pl','cień'),
('shadow','ru','тень'),
('shadow','ar','ظل'),
('shadow','hi','छाया')
on conflict (grp, lang) do update set answer = excluded.answer;
commit;
