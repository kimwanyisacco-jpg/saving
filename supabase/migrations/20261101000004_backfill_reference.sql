-- Reference numbers are issued by the system. Early records left this column
-- empty, so give every one a reference derived from its receipt: the kind, then
-- the receipt sequence. Rows that already carry a reference are left alone.
update transactions t
set reference = case t.kind
      when 'savings_deposit'   then 'DEP'
      when 'savings_withdrawal' then 'WDR'
      when 'credit_issued'     then 'CRD'
      else 'RPY'
    end || '-' || lpad((regexp_match(t.receipt_no, '([0-9]+)$'))[1], 5, '0')
where t.reference is null
  and t.receipt_no ~ '[0-9]+$';
