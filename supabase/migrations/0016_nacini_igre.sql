-- 0016: načini igre (ideja 5, PDF "Guglaj ako smiješ: kreativne ideje").
-- Svi su vrsta 'trening': ne ulaze u rang-liste ni lige. Rekord se vodi po igraču i načinu.
--   kava      Mozak uz kavu: bez vremenskog ograničenja (sat od sat vremena), 10 pitanja
--   pakao     Intelektualni pakao: samo teška pitanja (težina 3), 10 pitanja
--   smrt      Iznenadna smrt ega: prva greška završava igru (prekida preglednik), do 30 pitanja
--   autocesta Mozak na autocesti: 5 sekundi po pitanju, samo pitanja s ponuđenim odgovorima, 10 pitanja
--   rulet     Ruski rulet znanja: nasumične kategorije i težine, 10 pitanja
--   obracun   Obračun s vlastitim egom: kao rulet, cilj je srušiti vlastiti rekord
-- Kao i trening: bez današnjih pitanja dana, prednost pitanjima koja su već bila u kvizu dana.

alter table igra.kvizovi add column nacin text
  check (nacin in ('kava','pakao','smrt','autocesta','rulet','obracun'));

-- Vrijeme po pitanju za načine igre. Ne mijenja dohvati_pitanje: postavlja se pri unosu reda odgovora.
create function igra.vrijeme_nacina() returns trigger
language plpgsql set search_path = '' as $$
declare n text;
begin
  select nacin into n from igra.kvizovi where id = new.kviz_id;
  if n = 'kava' then new.vrijeme_ms := 3600000;
  elsif n = 'autocesta' then new.vrijeme_ms := 5000;
  end if;
  return new;
end $$;
create trigger odgovori_vrijeme_nacina before insert on igra.odgovori
  for each row execute function igra.vrijeme_nacina();

create function public.pocni_nacin(p_igrac uuid, p_nacin text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare k igra.kvizovi; d date := igra.danas(); danasnja text[]; koliko int; rekord int;
begin
  if not exists (select 1 from igra.igraci where id = p_igrac) then raise exception 'Nepoznat igrač.'; end if;
  if p_nacin is null or p_nacin not in ('kava','pakao','smrt','autocesta','rulet','obracun') then
    raise exception 'Nepoznat način igre.';
  end if;
  koliko := case p_nacin when 'smrt' then 30 else 10 end;
  select pitanja into danasnja from igra.dnevni_setovi where dan = d;
  select coalesce(max(ukupno_bodova), 0) into rekord from igra.kvizovi where igrac_id = p_igrac and nacin = p_nacin;

  insert into igra.kvizovi (vrsta, pitanja, igrac_id, nacin)
  values ('trening', array(
      select p.id from igra.pitanja p
      where p.aktivno and p.id not like 'probno-%'
        and not (p.id = any(coalesce(danasnja, '{}')))
        and (p_nacin <> 'pakao' or p.tezina = 3)
        and (p_nacin <> 'autocesta' or p.podaci ? 'ponudeno')
      order by exists (select 1 from igra.dnevni_setovi s where s.dan < d and p.id = any(s.pitanja)) desc, random()
      limit koliko), p_igrac, p_nacin)
  returning * into k;
  if coalesce(array_length(k.pitanja, 1), 0) = 0 then raise exception 'Nema pitanja za taj način igre.'; end if;
  return jsonb_build_object('kvizId', k.id, 'brojPitanja', array_length(k.pitanja, 1), 'rekord', rekord);
end $$;

revoke all on function public.pocni_nacin(uuid, text) from public;
grant execute on function public.pocni_nacin(uuid, text) to anon, authenticated;
