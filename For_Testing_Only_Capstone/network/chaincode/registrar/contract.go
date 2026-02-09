package main

import (
	"encoding/json"
	"fmt"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type Degree struct {
	ID         string `json:"id"`
	Student    string `json:"student_name"`
	Section    string `json:"section"`
	Course     string `json:"course"`
	Year       string `json:"year"`
	IpfsCID    string `json:"ipfs_cid"`   
	Amount     string `json:"amount"`
	Type       string `json:"type"`
	University string `json:"university"`
	Date       string `json:"date"`
	Status     string `json:"status"`
}

type SmartContract struct {
	contractapi.Contract
}

func (s *SmartContract) IssueDegree(ctx contractapi.TransactionContextInterface, id string, name string, section string, course string, year string, ipfs string, amount string, transType string, date string) error {
	exists, err := s.DegreeExists(ctx, id)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("the record %s already exists", id)
	}

	degree := Degree{
		ID:         id,
		Student:    name,
		Section:    section,
		Course:     course,
		Year:       year,
		IpfsCID:    ipfs,
		Amount:     amount,
		Type:       transType,
		University: "PLV",        
		Date:       date,
		Status:     "Verified",   
	}

	degreeJSON, err := json.Marshal(degree)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(id, degreeJSON)
}

func (s *SmartContract) GetAllDegrees(ctx contractapi.TransactionContextInterface) ([]*Degree, error) {
	resultsIterator, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()

	var degrees []*Degree
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}

		var degree Degree
		err = json.Unmarshal(queryResponse.Value, &degree)
		if err != nil {
			return nil, err
		}
		degrees = append(degrees, &degree)
	}
	return degrees, nil
}

func (s *SmartContract) ReadDegree(ctx contractapi.TransactionContextInterface, id string) (*Degree, error) {
	degreeJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return nil, fmt.Errorf("failed to read from state: %v", err)
	}
	if degreeJSON == nil {
		return nil, fmt.Errorf("the degree %s does not exist", id)
	}

	var degree Degree
	err = json.Unmarshal(degreeJSON, &degree)
	if err != nil {
		return nil, err
	}
	return &degree, nil
}

func (s *SmartContract) DegreeExists(ctx contractapi.TransactionContextInterface, id string) (bool, error) {
	degreeJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return false, fmt.Errorf("failed to read from state: %v", err)
	}
	return degreeJSON != nil, nil
}

func main() {
	registrarContract := new(SmartContract)

	chaincode, err := contractapi.NewChaincode(registrarContract)
	if err != nil {
		fmt.Printf("Error creating registrar chaincode: %s", err)
		return
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting registrar chaincode: %s", err)
	}
}