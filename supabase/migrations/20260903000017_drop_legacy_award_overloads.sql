-- 0017 · drop legacy single-arg award overloads.
-- sp/mp.award(text) alongside sp/mp.award(text, uuid DEFAULT NULL) made every
-- single-arg call (e.g. award('win')) ambiguous → 42725, breaking win paths.
drop function if exists sp.award(text);
drop function if exists mp.award(text);
